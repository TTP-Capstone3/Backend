const { DataTypes } = require("sequelize")
const db = require('../db')

const Categories = db.define("category", {
    // A category is created by a user and really only needs a title.
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true,
        },
    },
});

module.exports = Categories