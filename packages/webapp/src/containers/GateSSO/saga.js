/*
 *  Copyright 2026 LiteFarm.org
 *  This file is part of LiteFarm.
 *
 *  LiteFarm is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  LiteFarm is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 *  GNU General Public License for more details, see <https://www.gnu.org/licenses/>.
 */

import { createAction } from '@reduxjs/toolkit';
import { call, put, takeLeading } from 'redux-saga/effects';
import { loginSuccess } from '../userFarmSlice';
import history from '../../history';

// irl.coop fleet-gate SSO auto-login. Fired once on boot (main.jsx) when there
// is no `id_token`: the coop fleet gate has already authenticated and forwarded
// the identity, so a same-origin POST to /gate_sso (proxied by the webapp's
// nginx to the API) create-or-logins the member and returns a LiteFarm token.

export const gateSsoLogin = createAction(`gateSsoLoginSaga`);

export function* gateSsoLoginSaga() {
  try {
    const res = yield call(
      fetch,
      `${window.location.origin}/gate_sso`,
      { method: 'POST', credentials: 'include' },
    );
    if (!res.ok) return; // gate didn't authenticate — fall through to normal login
    const { id_token, user } = yield call([res, res.json]);
    if (!id_token || !user?.user_id) return;

    localStorage.setItem('id_token', id_token);
    if (user.language_preference) localStorage.setItem('litefarm_lang', user.language_preference);

    yield put(loginSuccess(user));
    history.push('/farm_selection');
  } catch (e) {
    console.warn('gate SSO auto-login skipped:', e?.message);
  }
}

export default function* gateSsoSaga() {
  yield takeLeading(gateSsoLogin.type, gateSsoLoginSaga);
}
