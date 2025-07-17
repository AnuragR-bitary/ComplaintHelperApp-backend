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

  async findOrCreate(keycloakId, email) {
    let user = await this.findByKeycloakId(keycloakId);
    
    if (!user) {
      user = await this.create({
        keycloakId,
        email: email.toLowerCase()
      });
    }
    
    return user;
  }
}

module.exports = new UserRepository();
