import axios from 'axios';
import UserModel from '../models/userModel.js';
import UserFarmModel from '../models/userFarmModel.js';
import FarmModel from '../models/farmModel.js';
import ShowedSpotlightModel from '../models/showedSpotlightModel.js';
import { createToken } from '../util/jwt.js';

// irl.coop fleet gate -> Gate SSO auto-login. The oauth2-proxy gate forwards
// identity headers (X-Forwarded-User = Keycloak sub, X-Forwarded-Email =
// canonical email, X-Forwarded-Preferred-Username = display name). This
// create-or-logins the LiteFarm user, syncs their seats for any provisioned
// farm (farm = group), and mints LiteFarm's HS256 access token.
const COOP_API = process.env.COOP_API_URL || 'https://api.irl.coop';
const COOP_TOKEN = process.env.KEYCLOAK_GROUPS_TOKEN || '';

async function getCoopGroups(sub) {
  if (!COOP_TOKEN) return [];
  const { data } = await axios.get(`${COOP_API}/api/internal/groups`, {
    params: { sub },
    headers: { Authorization: `Bearer ${COOP_TOKEN}` },
    timeout: 10000,
  });
  return Array.isArray(data.groups) ? data.groups : [];
}

// Ensure the user has an Active seat on every farm already provisioned for one
// of their groups (farm_id = group id). Farms are created by the provisioning
// workflow, not here — a personal 1-of-1 group has no farm, so it is skipped.
async function syncSeats(userId, groups) {
  for (const groupId of groups) {
    const farm = await FarmModel.query().findById(groupId);
    if (!farm) continue;
    const seat = await UserFarmModel.query()
      .where({ user_id: userId, farm_id: groupId })
      .first();
    if (!seat) {
      await UserFarmModel.query().insert({
        user_id: userId,
        farm_id: groupId,
        role_id: 3, // Farm Owner (default seat role)
        status: 'Active',
      });
    }
  }
}

const gateSsoController = {
  gateSsoLogin() {
    return async (req, res) => {
      const sub = req.headers['x-forwarded-user'];
      const email = req.headers['x-forwarded-email'];
      const name = req.headers['x-forwarded-preferred-username'];
      if (!sub || !email) {
        return res
          .status(401)
          .send({ message: 'Missing forwarded identity (gate) headers' });
      }

      try {
        // 1. create-or-login the user (keyed by sub, fall back to email)
        let user = await UserModel.query().findById(sub);
        if (!user) user = await UserModel.query().where({ email }).first();
        if (!user) {
          const [first_name, ...rest] = String(name || email.split('@')[0]).split(' ');
          user = await UserModel.transaction(async (trx) => {
            const u = await UserModel.query(trx)
              .insert({
                user_id: sub,
                email,
                first_name: first_name || '',
                last_name: rest.join(' '),
              })
              .returning('*');
            await ShowedSpotlightModel.query(trx).insert({ user_id: sub });
            return u;
          });
        }

        // 2. sync seats for provisioned farms (farm = group)
        const groups = await getCoopGroups(sub);
        await syncSeats(user.user_id, groups);

        // 3. mint LiteFarm's access token
        const id_token = await createToken('access', { user_id: user.user_id });
        return res.status(200).send({ id_token, user });
      } catch (err) {
        console.error('gate_sso failed', err);
        return res.status(400).json({ err });
      }
    };
  },
};

export default gateSsoController;
