import { Request, Response } from 'express'; 
import bcrypt from 'bcrypt';                  
import db from '@models';  

const User = db.User;

/**
 * @param req 
 * @param res 
 */
export const createUser = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required.' });
    }

   
    const password_hash = await bcrypt.hash(password, 10);

   
    const newUser = await User.create({
      username,
      email,
      password_hash,
      isAdmin: true 
    });

    return res.status(201).json({
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      isAdmin: newUser.isAdmin,
      createdAt: newUser.createdAt,
    });
  } catch (error: any) {

    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0].path; 
      return res.status(409).json({ message: `${field} already exists.` }); 
    }
    console.error('Error creating user:', error); 
    return res.status(500).json({ message: 'Failed to create user.' });
  }
};