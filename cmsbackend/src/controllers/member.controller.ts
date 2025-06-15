import { Request, Response } from 'express'; 
import db from '@models';                     

const Member = db.Member;
const Family = db.Family;

/**
 * @param req 
 * @param res 
 * @returns 
 */
export const createMember = async (req: Request, res: Response): Promise<Response> => {
  try {
    const {
      firstName, lastName, middleName, gender, dateOfBirth,
      email, phoneNumber, address, city, county, postalCode,
      status, baptismDate, membershipDate, familyId, profilePictureUrl, notes
    } = req.body;

    if (!firstName || !lastName || !membershipDate) {
      return res.status(400).json({ message: 'First name, last name, and membership date are required.' });
    }

    if (familyId) {
      const familyExists = await Family.findByPk(familyId);
      if (!familyExists) {
        return res.status(400).json({ message: `Family with ID ${familyId} not found.` });
      }
    }

    const newMember = await Member.create({
      firstName, lastName, middleName, gender, dateOfBirth,
      email, phoneNumber, address, city, county, postalCode,
      status, baptismDate, membershipDate, familyId, profilePictureUrl, notes
    });

    return res.status(201).json(newMember);
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      return res.status(409).json({ message: `Member with this ${field} already exists.` });
    }
    console.error('Error creating member:', error);
    return res.status(500).json({ message: 'Failed to create member.' });
  }
};

/**
 * @param req 
 * @param res 
 * @returns 
 */
export const getAllMembers = async (req: Request, res: Response): Promise<Response> => {
  try {
    const members = await Member.findAll({
      include: [{ model: db.Family, as: 'family' }] 
    });
    return res.status(200).json(members);
  } catch (error) {
    console.error('Error fetching members:', error);
    return res.status(500).json({ message: 'Failed to retrieve members.' });
  }
};

/**
 * @param req 
 * @param res 
 * @returns 
 */
export const getMemberById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const member = await Member.findByPk(id, {
      include: [{ model: db.Family, as: 'family' }] 
    });

    if (!member) {
      return res.status(404).json({ message: 'Member not found.' });
    }

    return res.status(200).json(member);
  } catch (error) {
    console.error('Error fetching member by ID:', error);
    return res.status(500).json({ message: 'Failed to retrieve member.' });
  }
};

/**
 * @param req 
 * @param res 
 * @returns 
 */
export const updateMember = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const { familyId } = req.body;

    if (familyId) {
      const familyExists = await Family.findByPk(familyId);
      if (!familyExists) {
        return res.status(400).json({ message: `Family with ID ${familyId} not found for update.` });
      }
    }

    const [updatedRowsCount] = await Member.update(req.body, {
      where: { id },
    });

    if (updatedRowsCount === 0) {
      return res.status(404).json({ message: 'Member not found or no changes made.' });
    }

    const updatedMember = await Member.findByPk(id, {
      include: [{ model: db.Family, as: 'family' }]
    });
    return res.status(200).json(updatedMember);
  } catch (error: any) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path;
      return res.status(409).json({ message: `Member with this ${field} already exists.` });
    }
    console.error('Error updating member:', error);
    return res.status(500).json({ message: 'Failed to update member.' });
  }
};

/**
 * @param req
 * @param res 
 * @returns
 */
export const deleteMember = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { id } = req.params;
    const deletedRowCount = await Member.destroy({
      where: { id },
    });

    if (deletedRowCount === 0) {
      return res.status(404).json({ message: 'Member not found.' });
    }

    return res.status(204).send(); 
  } catch (error) {
    console.error('Error deleting member:', error);
    return res.status(500).json({ message: 'Failed to delete member.' });
  }
};