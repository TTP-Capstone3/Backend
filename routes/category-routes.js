// Basic Routes:
// GET    /categories
// GET    /categories/:id
// POST   /categories
// PATCH  /categories/:id
// DELETE /categories/:id

const express = require('express');
const {Op, fn, col, where: sequelizeWhere} = require('sequelize');

const { Category } = require('../models');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Every category route requires an authenticated user.
// After this middleware runs, req.user contains the User model instance.
router.use(requireAuth);

// ---------------------------------------------------------
// GET /api/categories
// Return every category owned by the current user.
// ---------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const categories = await Category.findAll({
      where: {
        userId: req.user.id,
      },
      order: [['name', 'ASC']],
    });

    res.status(200).json(categories);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------
// GET /api/categories/:id
// Return one category owned by the current user.
// ---------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const category = await Category.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!category) {
      return res.status(404).json({error: 'Category not found.'});
    }

    res.status(200).json(category);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------
// POST /api/categories
// Create a category for the current user.
// ---------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const name = req.body.name?.trim();

    if (!name) {
      return res.status(400).json({error: 'Category name is required.'});
    }

    // Prevent one user from creating both "School" and "school".
    const existingCategory = await Category.findOne({
      where: {
        userId: req.user.id,
        [Op.and]: sequelizeWhere(
          fn('LOWER', col('name')), name.toLowerCase(),
        ),
      },
    });

    if (existingCategory) {
      return res.status(409).json({error: 'A category with this name already exists.'});
    }

    const category = await Category.create({
      name,
      userId: req.user.id,
    });

    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------
// PATCH /api/categories/:id
// Update the name or color of a category.
// ---------------------------------------------------------
router.patch('/:id', async (req, res, next) => {
  try {
    const category = await Category.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!category) {
      return res.status(404).json({error: 'Category not found.'});
    }

    const updates = {};
    if ('name' in req.body) {
      const name = req.body.name?.trim();
      if (!name) {
        return res.status(400).json({error: 'Category name cannot be empty.'});
      }

      const duplicateCategory = await Category.findOne({
        where: {
          userId: req.user.id,
          id: {[Op.ne]: category.id},
          [Op.and]: sequelizeWhere(fn('LOWER', col('name')), name.toLowerCase())
        },
      });

      if (duplicateCategory) {
        return res.status(409).json({error: 'A category with this name already exists.'});
      }

      updates.name = name;
    }

    await category.update(updates);

    res.status(200).json(category);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------
// DELETE /api/categories/:id
// Delete a category owned by the current user.
//
// Schedule items are not deleted. Their categoryId becomes null
// because the model association uses SET NULL.
// ---------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const category = await Category.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!category) {
      return res.status(404).json({error: 'Category not found.'});
    }

    await category.destroy();

    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

module.exports = router;