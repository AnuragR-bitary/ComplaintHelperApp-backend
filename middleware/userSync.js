const userRepository = require('../repositories/user.repository');

/**
 * Middleware to sync user data from JWT to database
 * Should be used after JWT verification middleware
 */
const syncUserFromJWT = async (req, res, next) => {
  try {
    console.log('User sync middleware triggered');
    console.log('Request user:', req.user);
    
    // Skip if no user data in request (shouldn't happen if JWT middleware is working)
    if (!req.user) {
      console.log('No user data in request');
      return next();
    }

    // Extract user data from JWT payload
    const { id: keycloakId, email, firstName = '', lastName = '' } = req.user;
    console.log('Extracted user data:', { keycloakId, email, firstName, lastName });

    if (!keycloakId || !email) {
      console.warn('Missing required user data in JWT:', { keycloakId, email });
      return next();
    }

    console.log('Attempting to find or create user in database...');
    
    // Find or create user in database
    const user = await userRepository.findOrCreate(
      keycloakId,
      email,
      firstName,
      lastName
    );

    console.log('User sync result:', user ? 'User found/created' : 'No user returned');

    // Attach the database user to the request
    req.dbUser = user;
    
    next();
  } catch (error) {
    console.error('Error syncing user from JWT:', error);
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }
    // Don't fail the request for user sync errors
    next();
  }
};

module.exports = syncUserFromJWT;
