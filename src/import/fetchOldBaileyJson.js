const RETRYABLE_STATUS_CODES = new Set([
  429,
  500,
  502,
  503,
  504,
]);

export async function fetchOldBaileyJson(
  url,
  {
    timeoutMs = 15000,
    maxAttempts = 3,
    retryDelayMs = 1000,
  } = {}
) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError(
      "maxAttempts must be a positive integer"
    );
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(
      "timeoutMs must be a positive number"
    );
  }

  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new RangeError(
      "retryDelayMs must be a non-negative number"
    );
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    let fetchFailed = false;

    try {
      let response;

      try {
        response = await fetch(url, {
          signal: controller.signal,
        });
      } catch (error) {
        fetchFailed = true;
        throw error;
      }

      if (!response.ok) {
        const error = new Error(
          `Old Bailey API request failed: ` +
            `${response.status} ${response.statusText}`
        );

        if (
          RETRYABLE_STATUS_CODES.has(response.status) &&
          attempt < maxAttempts
        ) {
          clearTimeout(timeout);

          await new Promise((resolve) =>
            setTimeout(resolve, retryDelayMs * attempt)
          );

          continue;
        }

        throw error;
      }

      return await response.json();
    } catch (error) {
      const isNetworkFailure =
        fetchFailed && error instanceof TypeError;

      const isTimeout =
        controller.signal.aborted &&
        error?.name === "AbortError";

      if (
        (isNetworkFailure || isTimeout) &&
        attempt < maxAttempts
      ) {
        clearTimeout(timeout);

        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs * attempt)
        );

        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}