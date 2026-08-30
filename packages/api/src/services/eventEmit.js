import axios from 'axios';

// Emit a LiteFarm domain event into the coop event store (source -> gateway ->
// store). Server-to-server; the shared KEYCLOAK_GROUPS_TOKEN guards coop-api's
// /api/internal/events/ingest. Fire-and-forget — the event store is the durable
// copy (idempotent on source_event_id), and a missed publish is not lost data
// for LiteFarm (its own tables are the domain source of truth).
const COOP_API = process.env.COOP_API_URL || 'https://api.irl.coop';
const COOP_TOKEN = process.env.KEYCLOAK_GROUPS_TOKEN || '';

export async function emitEvent({ sub, sourceEventId, type, payload }) {
  if (!COOP_TOKEN || !sub) return null;
  try {
    const { data } = await axios.post(
      `${COOP_API}/api/internal/events/ingest`,
      {
        sub,
        source: 'litefarm',
        source_event_id: sourceEventId ?? null,
        type,
        payload: payload ?? {},
        occurred_at: Date.now(),
      },
      { headers: { Authorization: `Bearer ${COOP_TOKEN}` }, timeout: 5000 },
    );
    return data.id ?? null;
  } catch (err) {
    console.warn('event emit failed (non-fatal):', err?.message);
    return null;
  }
}

export default emitEvent;
