import type { QueryInterface } from "sequelize";

module.exports = {
  async up(queryInterface: QueryInterface) {
    await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS unaccent;`);
  },

};