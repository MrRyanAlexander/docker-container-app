import '@testing-library/jest-dom'

// Setup Node.js environment for integration tests
const { TextEncoder, TextDecoder } = require('util');

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock fetch if not available
if (!global.fetch) {
  global.fetch = jest.fn();
}

// Mock Request if not available
if (!global.Request) {
  global.Request = class Request {
    constructor(input, init = {}) {
      // Make url a getter/setter to be compatible with NextRequest
      Object.defineProperty(this, 'url', {
        value: input,
        writable: false,
        enumerable: true,
        configurable: false
      });
      
      this.method = init?.method || 'GET';
      this.headers = new Headers(init?.headers);
      this.body = init?.body;
      
      // Additional properties that NextRequest might expect
      this.cache = init?.cache || 'default';
      this.credentials = init?.credentials || 'same-origin';
      this.destination = init?.destination || '';
      this.integrity = init?.integrity || '';
      this.mode = init?.mode || 'cors';
      this.redirect = init?.redirect || 'follow';
      this.referrer = init?.referrer || '';
      this.referrerPolicy = init?.referrerPolicy || '';
      this.signal = init?.signal || null;
    }
    
    // Add methods that NextRequest might need
    clone() {
      return new Request(this.url, {
        method: this.method,
        headers: this.headers,
        body: this.body
      });
    }
    
    async json() {
      if (typeof this.body === 'string') {
        return JSON.parse(this.body);
      }
      return this.body;
    }
    
    async text() {
      return String(this.body || '');
    }
  };
}

// Mock Response if not available
if (!global.Response) {
  global.Response = class Response {
    constructor(body, init) {
      this.body = body;
      this.status = init?.status || 200;
      this.statusText = init?.statusText || 'OK';
      this.headers = new Headers(init?.headers);
    }
    
    async json() {
      return JSON.parse(this.body);
    }
    
    async text() {
      return this.body;
    }
    
    // Add static json method for NextResponse compatibility
    static json(data, init) {
      return new Response(JSON.stringify(data), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...init?.headers
        }
      });
    }
  };
}

// Mock Headers if not available
if (!global.Headers) {
  global.Headers = class Headers {
    constructor(init) {
      this.map = new Map();
      if (init) {
        if (Array.isArray(init)) {
          init.forEach(([key, value]) => this.map.set(key.toLowerCase(), value));
        } else {
          Object.entries(init).forEach(([key, value]) => this.map.set(key.toLowerCase(), value));
        }
      }
    }
    
    get(name) {
      return this.map.get(name.toLowerCase());
    }
    
    set(name, value) {
      this.map.set(name.toLowerCase(), value);
    }
  };
}

// Mock Next.js router
jest.mock('next/router', () => ({
  useRouter: () => ({
    route: '/',
    pathname: '/',
    query: {},
    asPath: '/',
    push: jest.fn(),
    replace: jest.fn(),
    reload: jest.fn(),
    back: jest.fn(),
    prefetch: jest.fn().mockResolvedValue(undefined),
    beforePopState: jest.fn(),
    events: {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    },
  }),
}))

// Mock Auth0
jest.mock('@auth0/auth0-react', () => ({
  useAuth0: () => ({
    isLoading: false,
    isAuthenticated: false,
    user: undefined,
    loginWithRedirect: jest.fn(),
    logout: jest.fn(),
    getAccessTokenSilently: jest.fn(),
  }),
  Auth0Provider: ({ children }) => children,
}))

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    container: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    userEnv: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
}))

// Mock Docker
jest.mock('dockerode', () => {
  return jest.fn().mockImplementation(() => ({
    createContainer: jest.fn().mockResolvedValue({
      id: 'mock-container-id',
      start: jest.fn(),
      stop: jest.fn(),
      remove: jest.fn(),
      inspect: jest.fn(),
      exec: jest.fn().mockResolvedValue({
        start: jest.fn(),
      }),
      stats: jest.fn(),
    }),
    getContainer: jest.fn().mockReturnValue({
      id: 'mock-container-id',
      start: jest.fn(),
      stop: jest.fn(),
      remove: jest.fn(),
      inspect: jest.fn(),
      exec: jest.fn().mockResolvedValue({
        start: jest.fn(),
      }),
      stats: jest.fn(),
    }),
    listContainers: jest.fn().mockResolvedValue([]),
  }))
})

// Mock winston logger
jest.mock('@/lib/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logDebug: jest.fn(),
  logRequest: jest.fn(),
  logResponse: jest.fn(),
  logContainerOperation: jest.fn(),
  logSecurityEvent: jest.fn(),
  logAudit: jest.fn(),
}))

// Mock container pool
jest.mock('@/lib/container-pool', () => ({
  containerPool: {
    getContainer: jest.fn(),
    returnContainer: jest.fn(),
    removeContainer: jest.fn(),
    getPoolStats: jest.fn().mockReturnValue({
      totalContainers: 0,
      availableContainers: 0,
      reservedContainers: 0,
      images: {},
    }),
    shutdown: jest.fn(),
  },
}))

// Mock circuit breakers
jest.mock('@/lib/circuit-breaker', () => ({
  circuitBreakers: {
    database: {
      execute: jest.fn().mockImplementation((fn) => fn()),
      getState: jest.fn().mockReturnValue('CLOSED'),
      getStats: jest.fn(),
    },
    docker: {
      execute: jest.fn().mockImplementation((fn) => fn()),
      getState: jest.fn().mockReturnValue('CLOSED'),
      getStats: jest.fn(),
    },
    auth0: {
      execute: jest.fn().mockImplementation((fn) => fn()),
      getState: jest.fn().mockReturnValue('CLOSED'),
      getStats: jest.fn(),
    },
  },
  getAllCircuitBreakerStats: jest.fn().mockReturnValue([]),
}))

// Mock NextResponse specifically
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data, init) => {
      return new Response(JSON.stringify(data), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...init?.headers
        }
      });
    },
    redirect: (url, status = 302) => {
      return new Response(null, {
        status,
        headers: { Location: url }
      });
    }
  },
  NextRequest: global.Request
}));

// Increase timeout for integration tests
jest.setTimeout(30000) 