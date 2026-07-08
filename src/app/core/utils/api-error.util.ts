import { HttpErrorResponse } from '@angular/common/http';

export interface ApiErrorBody {
  code?: string;
  message?: string;
  fieldErrors?: { field?: string; message?: string }[];
}

const CODE_MESSAGES = {
  INVALID_CREDENTIALS: 'Email ou senha incorretos. Verifique os dados e tente novamente.',
  UNAUTHORIZED: 'Sessão inválida ou expirada. Faça login novamente.',
  VALIDATION_ERROR: 'Verifique os campos destacados e tente novamente.',
  CONFLICT: 'Não foi possível concluir: o registro já existe ou está em conflito.',
  SERVICE_UNAVAILABLE:
    'Serviço temporariamente indisponível. A API não conseguiu aceder à base de dados.',
  INTERNAL_ERROR:
    'Erro interno no servidor. Tente novamente em instantes ou contacte o suporte se persistir.',
} as const;

type ApiErrorCode = keyof typeof CODE_MESSAGES;

function messageForCode(code: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(CODE_MESSAGES, code)) {
    return CODE_MESSAGES[code as ApiErrorCode];
  }
  return undefined;
}

export function readApiErrorBody(err: unknown): ApiErrorBody | null {
  if (!(err instanceof HttpErrorResponse)) return null;
  const body = err.error;
  if (!body || typeof body !== 'object') return null;
  return body as ApiErrorBody;
}

/** Mensagem amigável para exibir ao utilizador a partir de um erro HTTP da API. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'Sem ligação ao servidor. Verifique a internet ou se a API está online.';
    }

    const body = readApiErrorBody(err);
    const code = body?.code?.trim();
    const serverMessage = body?.message?.trim();

    if (code === 'CONFLICT' && serverMessage) {
      return serverMessage;
    }

    const mapped = code ? messageForCode(code) : undefined;
    if (mapped) {
      return mapped;
    }

    if (serverMessage && serverMessage !== 'Erro interno') {
      return serverMessage;
    }

    if (err.status === 401) {
      return CODE_MESSAGES.INVALID_CREDENTIALS;
    }
    if (err.status === 503) {
      return CODE_MESSAGES.SERVICE_UNAVAILABLE;
    }
    if (err.status >= 500) {
      return CODE_MESSAGES.INTERNAL_ERROR;
    }
    if (err.status === 409 && serverMessage) {
      return serverMessage;
    }
  }

  return fallback;
}
