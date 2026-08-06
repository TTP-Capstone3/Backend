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

const DEFAULT_CATEGORY_COLOR = '#949494';
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// Helper function to normalize category colors.
function normalizeCategoryColor(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const color = value.trim().toUpperCase();
  return HEX_COLOR_PATTERN.test(color) ? color : null;
}

// ---------------------------------------------------------
// GET /categories
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
// GET /categories/:id
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
// POST /categories
// Create a category for the current user.
// ---------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const name = req.body.name?.trim();
    if (!name) {
      return res.status(400).json({error: 'Category name is required.'});
    }

    let color = DEFAULT_CATEGORY_COLOR;
    if ('color' in req.body) {
      color = normalizeCategoryColor(req.body.color);
      if (!color) {
        return res.status(400).json({error: 'Category color must use the format #RRGGBB.'});
      }
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
      color,
      userId: req.user.id,
    });

    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------
// PATCH /categories/:id
// Update the name of a category.
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

    if ('color' in req.body) {
      const color = normalizeCategoryColor(req.body.color);
      if (!color) {
        return res.status(400).json({ error: 'Category color must use the format #RRGGBB.'});
      }

      updates.color = color;
    }

    await category.update(updates);

    res.status(200).json(category);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------
// DELETE /categories/:id
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