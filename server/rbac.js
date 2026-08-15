/**
 * Role definitions for CommerceAds OS.
 *
 * The user base in SPEC.md is the marketplace's ad sales org: reps, their
 * manager, and the revenue lead — plus the operational roles around them.
 * Each role carries three independent grants:
 *
 *   routes   — which screens the app will render (nav + route guard)
 *   entities — which records the API will serve, per action
 *   caps     — privileged operations that are not plain CRUD
 *
 * Server-side enforcement lives in entities.js / functions.js. The client uses
 * the same shape (served from /api/auth/me) to hide what it cannot use, but the
 * client copy is a convenience — it is never the security boundary.
 */

export const ACTIONS = ['read', 'create', 'update', 'delete'];

export const CAPS = {
  DIAL: 'dial',
  APPROVE_OPTIMIZATION: 'approve_optimization',
  MANAGE_SUPPRESSIONS: 'manage_suppressions',
  VIEW_AUDIT: 'view_audit',
  MANAGE_USERS: 'manage_users'
};

const READ_ALL = { '*': ['read'] };

// Audit logging is append-only and every authenticated action can produce one,
// so no role is allowed to fail an audit write. Merged into every role below.
const AUDIT_WRITE = { AuditLog: ['create'] };

export const ROLES = {
  admin: {
    key: 'admin',
    label: 'Administrator',
    blurb: 'Unrestricted access across every module, including compliance and user management.',
    demo: { email: 'admin@commerceads.io', full_name: 'Aarav Sharma' },
    routes: ['*'],
    entities: { '*': ['read', 'create', 'update', 'delete'] },
    caps: [CAPS.DIAL, CAPS.APPROVE_OPTIMIZATION, CAPS.MANAGE_SUPPRESSIONS, CAPS.VIEW_AUDIT, CAPS.MANAGE_USERS]
  },

  revenue_lead: {
    key: 'revenue_lead',
    label: 'Revenue Lead',
    blurb: 'Full visibility across the funnel plus optimization approvals. Cannot alter compliance records.',
    demo: { email: 'revenue@commerceads.io', full_name: 'Priya Nair' },
    routes: ['/', '/signals', '/mql', '/sdr', '/workspace', '/pipeline', '/campaigns', '/churn', '/experiments', '/models', '/sellers', '/compliance'],
    entities: {
      ...READ_ALL,
      Campaign: ['read', 'update'],
      Opportunity: ['read', 'update']
    },
    caps: [CAPS.APPROVE_OPTIMIZATION, CAPS.VIEW_AUDIT]
  },

  sales_manager: {
    key: 'sales_manager',
    label: 'Sales Manager',
    blurb: 'Runs the selling motion: queues, dialing, pipeline and campaign optimization. No compliance access.',
    demo: { email: 'manager@commerceads.io', full_name: 'Rohan Mehta' },
    routes: ['/', '/signals', '/mql', '/sdr', '/workspace', '/pipeline', '/campaigns', '/churn', '/experiments', '/models', '/sellers'],
    entities: {
      ...READ_ALL,
      Lead: ['read', 'create', 'update'],
      AgentRun: ['read', 'create', 'update'],
      Opportunity: ['read', 'create', 'update'],
      Interaction: ['read', 'create', 'update'],
      Sequence: ['read', 'create', 'update'],
      Campaign: ['read', 'update']
    },
    caps: [CAPS.DIAL, CAPS.APPROVE_OPTIMIZATION]
  },

  ae: {
    key: 'ae',
    label: 'Account Executive',
    blurb: 'Works an assigned lead queue and the pipeline. No prospecting console, no model internals.',
    demo: { email: 'ae@commerceads.io', full_name: 'Ananya Iyer' },
    routes: ['/', '/workspace', '/pipeline', '/sellers', '/campaigns', '/churn', '/sdr/calls'],
    entities: {
      Seller: ['read'],
      Contact: ['read'],
      Lead: ['read', 'update'],
      AgentRun: ['read'],
      Opportunity: ['read', 'update'],
      Interaction: ['read', 'create'],
      Campaign: ['read'],
      AdPackage: ['read'],
      Experiment: ['read'],
      ModelVersion: ['read'],
      Sequence: ['read']
    },
    caps: [CAPS.DIAL]
  },

  sdr: {
    key: 'sdr',
    label: 'SDR Operations',
    blurb: 'Drives prospecting and the AI calling floor. Cannot move pipeline or approve spend.',
    demo: { email: 'sdr@commerceads.io', full_name: 'Kabir Singh' },
    routes: ['/', '/signals', '/mql', '/sdr', '/sellers'],
    entities: {
      Seller: ['read'],
      Contact: ['read'],
      Lead: ['read', 'create', 'update'],
      AgentRun: ['read', 'create', 'update'],
      Sequence: ['read', 'create', 'update'],
      Suppression: ['read'],
      AdPackage: ['read'],
      Campaign: ['read'],
      Opportunity: ['read'],
      Interaction: ['read', 'create']
    },
    caps: [CAPS.DIAL]
  },

  analyst: {
    key: 'analyst',
    label: 'Analyst',
    blurb: 'Read-only across intelligence and performance. Cannot dial, approve, or edit any record.',
    demo: { email: 'analyst@commerceads.io', full_name: 'Diya Krishnan' },
    routes: ['/', '/signals', '/campaigns', '/churn', '/experiments', '/models', '/sellers'],
    entities: { ...READ_ALL },
    caps: []
  },

  compliance: {
    key: 'compliance',
    label: 'Compliance Officer',
    blurb: 'Owns suppressions and the audit trail. Sees calls for review but cannot sell or dial.',
    demo: { email: 'compliance@commerceads.io', full_name: 'Vikram Rao' },
    routes: ['/', '/compliance', '/sellers', '/sdr/calls'],
    entities: {
      Seller: ['read'],
      Contact: ['read'],
      Lead: ['read'],
      AgentRun: ['read'],
      // Read-only on commercial records so the Command Center and global search
      // resolve for this role; compliance still cannot alter any of them.
      Opportunity: ['read'],
      Campaign: ['read'],
      Suppression: ['read', 'create', 'update', 'delete'],
      AuditLog: ['read', 'create']
    },
    caps: [CAPS.MANAGE_SUPPRESSIONS, CAPS.VIEW_AUDIT]
  }
};

export const ROLE_KEYS = Object.keys(ROLES);

export const DEFAULT_ROLE = 'analyst';

export function getRole(key) {
  return ROLES[key] || ROLES[DEFAULT_ROLE];
}

/** Effective entity grants for a role, with the universal audit-write merged in. */
function grantsFor(role) {
  const base = role.entities || {};
  const merged = { ...base };
  for (const [entity, actions] of Object.entries(AUDIT_WRITE)) {
    merged[entity] = Array.from(new Set([...(merged[entity] || base['*'] || []), ...actions]));
  }
  return merged;
}

export function canEntity(roleKey, entity, action) {
  const role = getRole(roleKey);
  const grants = grantsFor(role);
  const explicit = grants[entity];
  if (explicit) return explicit.includes(action);
  const wildcard = grants['*'];
  return Array.isArray(wildcard) ? wildcard.includes(action) : false;
}

export function hasCap(roleKey, cap) {
  return getRole(roleKey).caps.includes(cap);
}

export function canRoute(roleKey, path) {
  const { routes } = getRole(roleKey);
  if (routes.includes('*')) return true;
  return routes.some((allowed) => (allowed === '/' ? path === '/' : path === allowed || path.startsWith(`${allowed}/`)));
}

/** The role shape the browser receives — safe to expose, mirrors enforcement. */
export function publicRole(roleKey) {
  const role = getRole(roleKey);
  return {
    key: role.key,
    label: role.label,
    blurb: role.blurb,
    routes: role.routes,
    entities: grantsFor(role),
    caps: role.caps
  };
}

export function demoRoster() {
  return ROLE_KEYS.map((key) => {
    const role = ROLES[key];
    return {
      role: key,
      label: role.label,
      blurb: role.blurb,
      email: role.demo.email,
      full_name: role.demo.full_name
    };
  });
}
