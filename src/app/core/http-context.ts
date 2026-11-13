import { HttpContextToken } from '@angular/common/http';

/** Lets the Unlock screen verify a candidate key before it is stored. */
export const GATEWAY_KEY_OVERRIDE = new HttpContextToken<string | null>(() => null);
