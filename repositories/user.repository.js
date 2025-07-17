// repositories/user.repository.js
const BaseRepository = require("./base.repository");
const User = require("../models/user");

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  async findByKeycloakId(keycloakId, populate = []) {
    return this.findOne({ keycloakId }, populate);
  }

  async findByEmail(email, populate = []) {
    return this.findOne({ email: email.toLowerCase() }, populate);
  }

  /**
   * Finds a user by keycloakId or creates a new one with provided details.
   * @param {string} keycloakId
   * @param {string} email
   * @param {string} [firstName]
   * @param {string} [lastName]
   */
  async findOrCreate(keycloakId, email, firstName = '', lastName = '') {
    let user = await this.findByKeycloakId(keycloakId);
    
    if (!user) {
      user = await this.create({
        keycloakId,
        email: email.toLowerCase(),
        firstName,
        lastName
      });
    }
    
    return user;
  }
}

module.exports = new UserRepository();
