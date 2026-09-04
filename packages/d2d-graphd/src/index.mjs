export { createClient, GraphdError } from './client.mjs'
export { default as postinstallNotice } from './postinstall.mjs'

export const GRAPHD_DEFAULT_URL = 'http://127.0.0.1:8766'
export const FINDING_STATES = ['candidate', 'verified', 'false-positive', 'exploited', 'reported', 'archived', 'dropped']
