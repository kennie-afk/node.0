import { FieldRepository } from '../repositories/FieldRepository';
import { FieldObservation } from '../models/FieldObservation.model';
import { Field } from '../models/Field.model';

type Stage = 'PLANTED' | 'GROWING' | 'READY' | 'HARVESTED';

export class FieldService {
  private fieldRepo = new FieldRepository();

  calculateStatus(field: any): 'ACTIVE' | 'AT_RISK' | 'COMPLETED' {
    if (field.currentStage === 'HARVESTED') return 'COMPLETED';
    const daysSincePlanting = Math.floor((Date.now() - new Date(field.plantingDate).getTime()) / (1000 * 60 * 60 * 24));
    const lastUpdate = field.observations && field.observations.length > 0 ? field.observations[0].createdAt : field.updatedAt;
    const daysSinceUpdate = Math.floor((Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceUpdate > 14 || (field.currentStage === 'PLANTED' && daysSincePlanting > 60)) return 'AT_RISK';
    return 'ACTIVE';
  }

  async getDashboardData(userId: number, role: string) {
    if (role === 'ADMIN') {
      const fields = await this.fieldRepo.findAll();
      const statusBreakdown = this.getStatusBreakdown(fields);
      return { totalFields: fields.length, fields, statusBreakdown };
    } else {
      const fields = await this.fieldRepo.findByAgentId(userId);
      const statusBreakdown = this.getStatusBreakdown(fields);
      return { totalFields: fields.length, fields, statusBreakdown };
    }
  }

  private getStatusBreakdown(fields: any[]) {
    const breakdown = { ACTIVE: 0, 'AT_RISK': 0, COMPLETED: 0 };
    fields.forEach(field => {
      const status = this.calculateStatus(field);
      breakdown[status]++;
    });
    return breakdown;
  }

  async updateStageAndCalculate(fieldId: number, newStage: Stage, notes: string, userId: number) {
    const field = await this.fieldRepo.findById(fieldId);
    if (!field) throw new Error('Field not found');

    await field.update({ currentStage: newStage });

    await FieldObservation.create({
      fieldId: field.id,
      stage: newStage,
      notes: notes || '',
      createdById: userId
    });

    const updatedField = await this.fieldRepo.findById(fieldId);
    return updatedField;
  }
}