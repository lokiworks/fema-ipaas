export class HttpError extends Error {
  private readonly status: number;
  private readonly responseBody: unknown;
  private readonly headers: HttpErrorHeaders;

  constructor(private readonly requestBody: unknown, params: HttpErrorParams) {
    const status = params.status || 500;
    const responseBody = Buffer.isBuffer(params.responseBody) ? params.responseBody.toString() : params.responseBody;

    super(
      JSON.stringify({
        response: {
          status: status,
          body: responseBody,
        },
        request: {
          body: requestBody,
        },
      })
    );

    this.status = status;
    this.responseBody = responseBody;
    this.headers = params.responseHeaders ?? {};
  }

  public errorMessage() {
    return {
      response: {
        status: this.status,
        body: this.responseBody,
      },
      request: {
        body: this.requestBody,
      },
    };
  }

  get response() {
    return {
      status: this.status,
      body: this.responseBody,
    };
  }

  get responseHeaders(): HttpErrorHeaders {
    return this.headers;
  }

  get request() {
    return {
      body: this.requestBody,
    };
  }
}

export function toFailsafeOutput({ error, requestBody }: FailsafeOutputParams) {
  if (error instanceof HttpError) {
    return error.errorMessage();
  }
  return {
    response: {
      status: 0,
      body: error instanceof Error ? error.message : String(error),
    },
    request: {
      body: requestBody,
    },
  };
}

export type HttpErrorHeaders = Record<string, string | string[] | undefined>;

export type HttpErrorParams = {
  status: number;
  responseBody: unknown;
  responseHeaders?: HttpErrorHeaders;
};

export type FailsafeOutputParams = {
  error: unknown;
  requestBody: unknown;
};
