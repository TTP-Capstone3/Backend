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
    
    color: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "#949494", // Grey
        validate: {
           isHexColor(value) {
                if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
                    throw new Error('Category color must be a valid six-digit hex color.');
                }
            }
        },
    }
});

module.exports = Categories