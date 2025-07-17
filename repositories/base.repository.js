// repositories/base.repository.js
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  async create(data, options = {}) {
    const docs = await this.model.create([data], options);
    return docs[0];
  }

  async findById(id, populate = [], options = {}) {
    let query = this.model.findById(id);
    populate.forEach((field) => {
      query = query.populate(field);
    });
    return await query.exec();
  }

  async findOne(conditions, populate = [], options = {}) {
    let query = this.model.findOne(conditions);
    populate.forEach((field) => {
      query = query.populate(field);
    });
    return await query.exec();
  }

  async find(conditions = {}, populate = [], sort = { createdAt: -1 }, options = {}) {
    let query = this.model.find(conditions).sort(sort);
    populate.forEach((field) => {
      query = query.populate(field);
    });
    return await query.exec();
  }

  async update(id, data, options = {}) {
    return await this.model
      .findByIdAndUpdate(
        id,
        { $set: { ...data, updatedAt: new Date() } },
        { new: true, ...options }
      )
      .session(options.session || null)
      .exec();
  }

  async delete(id, options = {}) {
    return await this.model
      .findByIdAndDelete(id)
      .session(options.session || null)
      .exec();
  }

  async count(conditions = {}, options = {}) {
    return await this.model
      .countDocuments(conditions)
      .session(options.session || null)
      .exec();
  }
}

module.exports = BaseRepository;