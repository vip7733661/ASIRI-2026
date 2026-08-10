export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export function normalizeError(error, fallbackCode = 'UNKNOWN_ERROR') {
  if (error instanceof AppError) return error;
  return new AppError(fallbackCode, error?.message || 'حدث خطأ غير متوقع', {
    cause: error,
  });
}

export async function safely(name, task, { onError, fallback = null } = {}) {
  try {
    return await task();
  } catch (error) {
    const normalized = normalizeError(error, `${name.toUpperCase()}_FAILED`);
    console.error(`[Asiri Music] ${name}`, normalized);
    onError?.(normalized);
    return fallback;
  }
}

export function installGlobalErrorBoundary(eventBus) {
  window.addEventListener('error', event => {
    eventBus.emit('app:error', normalizeError(event.error || new Error(event.message)));
  });

  window.addEventListener('unhandledrejection', event => {
    event.preventDefault();
    eventBus.emit('app:error', normalizeError(event.reason));
  });
}
