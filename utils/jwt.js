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
  try {
    console.log('Decoding JWT token...');
    console.log('Using Keycloak Issuer:', process.env.KEYCLOAK_ISSUER);
    console.log('Expected Audience:', process.env.KEYCLOAK_CLIENT_ID);
    
    const jwks = await getJWKS();
    console.log('Retrieved JWKS keys:', jwks.keys ? jwks.keys.length : 0, 'keys found');
    
    const [headerB64] = token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64').toString());
    console.log('JWT Header:', JSON.stringify(header, null, 2));
    
    if (!jwks.keys || !Array.isArray(jwks.keys)) {
      throw new Error('No keys found in JWKS response');
    }
    
    const key = jwks.keys.find(k => k.kid === header.kid);
    if (!key) {
      console.error('No matching key found in JWKS. Available KIDs:', jwks.keys.map(k => k.kid).join(', '));
      throw new Error(`No matching key found in JWKS for KID: ${header.kid}`);
    }
    
    const publicKey = await importJWK(key, key.alg);
    console.log('Verifying JWT with public key...');
    
    console.log('Verifying JWT with options:', {
      issuer: process.env.KEYCLOAK_ISSUER,
      audience: ['account', process.env.KEYCLOAK_CLIENT_ID], // Try both 'account' and client ID as audience
      algorithms: ['RS256']
    });
    
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: process.env.KEYCLOAK_ISSUER,
      audience: ['account', process.env.KEYCLOAK_CLIENT_ID], // Try both 'account' and client ID as audience
      algorithms: ['RS256']
    });
    
    console.log('JWT verification successful. Payload:', JSON.stringify(payload, null, 2));
    return payload;
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    if (error.code) console.error('Error code:', error.code);
    if (error.stack) console.error(error.stack);
    throw error;
  }
}

async function importJWK(jwk, alg) {
  return await require('jose').importJWK(jwk, alg);
}

module.exports = { decodeAndVerifyJWT };
