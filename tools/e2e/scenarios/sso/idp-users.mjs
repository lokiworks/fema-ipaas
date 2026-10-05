export const IDP_USERS = {
  'dev@ap.com': { name: 'Dev User', given_name: 'Dev', family_name: 'User', email_verified: true, groups: ['fema-admins'] },
  'admin@acme.test': { name: 'Alice Admin', given_name: 'Alice', family_name: 'Admin', email_verified: true, groups: ['fema-admins'] },
  'ops@acme.test': { name: 'Oscar Ops', given_name: 'Oscar', family_name: 'Ops', email_verified: true, groups: ['fema-ops'] },
  'member@acme.test': { name: 'Mia Member', given_name: 'Mia', family_name: 'Member', email_verified: true, groups: ['staff'] },
  'newhire@acme.test': { name: 'Nina Newhire', given_name: 'Nina', family_name: 'Newhire', email_verified: true, groups: ['staff'] },
  'disabled@acme.test': { name: 'Dan Disabled', given_name: 'Dan', family_name: 'Disabled', email_verified: true, groups: ['staff'] },
  'unverified@acme.test': { name: 'Uma Unverified', given_name: 'Uma', family_name: 'Unverified', email_verified: false, groups: ['staff'] },
  'outsider@other.test': { name: 'Otto Outsider', given_name: 'Otto', family_name: 'Outsider', email_verified: true, groups: ['staff'] },
}

export function claimsFor({ email }) {
  const profile = IDP_USERS[email]
  if (!profile) {
    return null
  }
  return { sub: `sub-${email}`, email, ...profile }
}
