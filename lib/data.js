/**
 * data.js — reads for the pages, backed by the zero-setup local DB (lib/db/local.mjs).
 * No Supabase, no signup: creators auto-provision on first visit, data persists.
 */
import * as store from './db/local.mjs';

export const SATS_PER_USD = 900;         // demo "≈" rate; live, use Blink realtimePrice
export const LOCAL = store.LOCAL;

export async function getCreator(username) { return store.getCreator(username); }
export async function getDashboard(username) { return store.getDashboard(username); }
