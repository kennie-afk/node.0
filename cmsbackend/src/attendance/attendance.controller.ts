import { Request, Response } from 'express';
import * as attendanceService from './attendance.service';
import { Attendance } from './attendance.model';

export const createAttendance = async (req: Request, res: Response): Promise<Response> => {
  try {
    const attendanceData = req.body;
    const newAttendance = await attendanceService.createAttendance(attendanceData);
    return res.status(201).json(newAttendance);
  } catch (error: any) {
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

export const getAllAttendance = async (req: Request, res: Response): Promise<Response> => {
  try {
    const filters = req.query;
    const attendanceRecords = await attendanceService.getAllAttendance(filters);
    return res.status(200).json(attendanceRecords);
  } catch (error: any) {
    console.error('Error in getAllAttendance controller:', error);
    return res.status(500).json({ message: 'Failed to retrieve attendance records.' });
  }
};

export const getAttendanceById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const attendanceRecord = await attendanceService.getAttendanceById(Number(id));
    if (!attendanceRecord) {
      return res.status(404).json({ message: 'Attendance record not found.' });
    }
    return res.status(200).json(attendanceRecord);
  } catch (error: any) {
    console.error('Error in getAttendanceById controller:', error);
    return res.status(500).json({ message: 'Failed to retrieve attendance record.' });
  }
};

export const updateAttendance = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const attendanceData = req.body;
    const updatedAttendance = await attendanceService.updateAttendance(Number(id), attendanceData);
    if (!updatedAttendance) {
      return res.status(404).json({ message: 'Attendance record not found or no changes made.' });
    }
    return res.status(200).json(updatedAttendance);
  } catch (error: any) {
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

export const deleteAttendance = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedCount = await attendanceService.deleteAttendance(Number(id));
    if (deletedCount === 0) {
      return res.status(404).json({ message: 'Attendance record not found.' });
    }
    return res.status(204).send();
  } catch (error: any) {
    console.error('Error in deleteAttendance controller:', error);
    return res.status(500).json({ message: 'Failed to delete attendance record.' });
  }
};