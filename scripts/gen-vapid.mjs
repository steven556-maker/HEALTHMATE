// يولّد مفاتيح VAPID لـ Web Push. شغّله مرة واحدة: node scripts/gen-vapid.mjs
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" });
const pub = publicKey.export({ format: "jwk" });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]).toString("base64url");

console.log("المفتاح العام (حطه في worker/wrangler.toml كـ VAPID_PUBLIC_KEY وفي .env كـ VITE_PUSH_PUBLIC_KEY):\n" + raw + "\n");
console.log("المفتاح الخاص (سر! متحطوش في git. نفّذ: npx wrangler secret put VAPID_PRIVATE_JWK ولصق السطر ده):\n" + JSON.stringify(jwk) + "\n");
