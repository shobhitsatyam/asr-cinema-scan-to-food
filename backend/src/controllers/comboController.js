const mongoose = require('mongoose');
const Combo = require('../models/Combo');
const { store } = require('../data/memoryStore');
const env = require('../config/env');

if (!store.combos) store.combos = [];

const getCombos = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const combos = await Combo.find().sort({ createdAt: -1 }).lean();
      return res.json({ success: true, count: combos.length, combos: combos || [] });
    }
    return res.json({ success: true, count: store.combos.length, combos: store.combos });
  } catch (err) {
    console.error('Error fetching combos:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve combos.', combos: [] });
  }
};

const createCombo = async (req, res) => {
  try {
    const { name, items, originalPrice, sellingPrice, image, description, badge, isAvailable } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Combo name is required.' });
    }
    const id = `combo-${Date.now()}`;
    const comboData = {
      id,
      name: name.trim(),
      items: Array.isArray(items) ? items : [],
      originalPrice: Number(originalPrice) || Number(sellingPrice) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      image: image || '',
      description: description || '',
      badge: badge || 'Popular',
      isAvailable: isAvailable !== false,
    };

    if (mongoose.connection.readyState === 1) {
      const combo = new Combo(comboData);
      const saved = await combo.save();
      return res.status(201).json({ success: true, combo: saved.toObject() });
    }

    store.combos.unshift(comboData);
    return res.status(201).json({ success: true, combo: comboData });
  } catch (err) {
    console.error('Error creating combo:', err);
    return res.status(500).json({ success: false, message: 'Failed to create combo.' });
  }
};

const updateCombo = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id).trim();

    if (mongoose.connection.readyState === 1) {
      const updated = await Combo.findOneAndUpdate({ id: cleanId }, { $set: req.body }, { new: true });
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Combo not found.' });
      }
      return res.json({ success: true, combo: updated.toObject() });
    }

    const idx = store.combos.findIndex(c => c.id === cleanId);
    if (idx < 0) return res.status(404).json({ success: false, message: 'Combo not found.' });
    store.combos[idx] = { ...store.combos[idx], ...req.body };
    return res.json({ success: true, combo: store.combos[idx] });
  } catch (err) {
    console.error('Error updating combo:', err);
    return res.status(500).json({ success: false, message: 'Failed to update combo.' });
  }
};

const toggleComboAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id).trim();

    if (mongoose.connection.readyState === 1) {
      const combo = await Combo.findOne({ id: cleanId });
      if (!combo) return res.status(404).json({ success: false, message: 'Combo not found.' });
      const nextState = req.body.isAvailable !== undefined ? Boolean(req.body.isAvailable) : !combo.isAvailable;
      combo.isAvailable = nextState;
      await combo.save();
      return res.json({ success: true, combo: combo.toObject() });
    }

    const item = store.combos.find(c => c.id === cleanId);
    if (!item) return res.status(404).json({ success: false, message: 'Combo not found.' });
    item.isAvailable = req.body.isAvailable !== undefined ? Boolean(req.body.isAvailable) : !item.isAvailable;
    return res.json({ success: true, combo: item });
  } catch (err) {
    console.error('Error toggling combo availability:', err);
    return res.status(500).json({ success: false, message: 'Failed to toggle availability.' });
  }
};

const deleteCombo = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id).trim();

    if (mongoose.connection.readyState === 1) {
      const deleted = await Combo.findOneAndDelete({ id: cleanId });
      if (!deleted) return res.status(404).json({ success: false, message: 'Combo not found.' });
      return res.json({ success: true, message: 'Combo deleted successfully.' });
    }

    store.combos = store.combos.filter(c => c.id !== cleanId);
    return res.json({ success: true, message: 'Combo deleted from dev store.' });
  } catch (err) {
    console.error('Error deleting combo:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete combo.' });
  }
};

module.exports = {
  getCombos,
  createCombo,
  updateCombo,
  toggleComboAvailability,
  deleteCombo,
};

