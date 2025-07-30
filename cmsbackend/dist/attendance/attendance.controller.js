"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAttendance = exports.updateAttendance = exports.getAttendanceById = exports.getAllAttendance = exports.createAttendance = void 0;
const attendanceService = __importStar(require("./attendance.service"));
const createAttendance = async (req, res) => {
    try {
        const attendanceData = req.body;
        const newAttendance = await attendanceService.createAttendance(attendanceData);
        return res.status(201).json(newAttendance);
    }
    catch (error) {
        console.error('Detailed Error in createAttendance controller:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            const validationError = error.errors && error.errors.length > 0 ? error.errors[0].message : 'Duplicate entry detected.';
            return res.status(409).json({ message: validationError });
        }
        if (error.message.includes('required')) {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes('not found')) {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to create attendance record.' });
    }
};
exports.createAttendance = createAttendance;
const getAllAttendance = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const filters = req.query;
        const { attendanceRecords, totalCount } = await attendanceService.getAllAttendance(filters, limit, offset);
        return res.status(200).json({
            data: attendanceRecords,
            meta: {
                totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        });
    }
    catch (error) {
        console.error('Error in getAllAttendance controller:', error);
        return res.status(500).json({ message: 'Failed to retrieve attendance records.' });
    }
};
exports.getAllAttendance = getAllAttendance;
const getAttendanceById = async (req, res) => {
    try {
        const { id } = req.params;
        const attendanceRecord = await attendanceService.getAttendanceById(Number(id));
        if (!attendanceRecord) {
            return res.status(404).json({ message: 'Attendance record not found.' });
        }
        return res.status(200).json(attendanceRecord);
    }
    catch (error) {
        console.error('Error in getAttendanceById controller:', error);
        return res.status(500).json({ message: 'Failed to retrieve attendance record.' });
    }
};
exports.getAttendanceById = getAttendanceById;
const updateAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const attendanceData = req.body;
        const updatedAttendance = await attendanceService.updateAttendance(Number(id), attendanceData);
        if (!updatedAttendance) {
            return res.status(404).json({ message: 'Attendance record not found or no changes made.' });
        }
        return res.status(200).json(updatedAttendance);
    }
    catch (error) {
        console.error('Error in updateAttendance controller:', error);
        if (error.name === 'SequelizeUniqueConstraintError') {
            const validationError = error.errors && error.errors.length > 0 ? error.errors[0].message : 'Duplicate entry detected.';
            return res.status(409).json({ message: validationError });
        }
        if (error.message.includes('not found for update')) {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to update attendance record.' });
    }
};
exports.updateAttendance = updateAttendance;
const deleteAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCount = await attendanceService.deleteAttendance(Number(id));
        if (deletedCount === 0) {
            return res.status(404).json({ message: 'Attendance record not found.' });
        }
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error in deleteAttendance controller:', error);
        return res.status(500).json({ message: 'Failed to delete attendance record.' });
    }
};
exports.deleteAttendance = deleteAttendance;
