const { jwtVerify } = require('jose');
const axios = require('axios');

let jwksCache = null;
let jwksCacheTime = 0;

async function getJWKS() {
  if (jwksCache && Date.now() - jwksCacheTime < 3600000) {
    return jwksCache;
  }
  const response = await axios.get(process.env.KEYCLOAK_JWKS_URI);
  jwksCache = response.data;
  jwksCacheTime = Date.now();
  return jwksCache;
}

async function decodeAndVerifyJWT(token) {
  const jwks = await getJWKS();
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
  const key = jwks.keys.find(k => k.kid === header.kid);
  if (!key) throw new Error('No matching key found in JWKS');
  const publicKey = await importJWK(key, key.alg);
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: process.env.KEYCLOAK_ISSUER,
    audience: process.env.KEYCLOAK_CLIENT_ID
  });
  return payload;
}

async function importJWK(jwk, alg) {
  return await require('jose').importJWK(jwk, alg);
}

module.exports = { decodeAndVerifyJWT };
