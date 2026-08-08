import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RoadmapInitiative } from '../roadmap/roadmap-initiative.entity';
import { moneyTransformer } from './business-money';
import { DEFAULT_BUSINESS_CURRENCY, type BusinessCurrency } from './business-currency';

@Entity('project_budgets')
export class ProjectBudget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'project_id', unique: true })
  projectId!: string;

  @OneToOne(() => RoadmapInitiative, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project?: RoadmapInitiative;

  @Column({ type: 'bigint', name: 'revenue_budget_cdf', default: 0, transformer: moneyTransformer })
  revenueBudgetCdf!: number;

  @Column({ type: 'varchar', length: 3, name: 'revenue_budget_currency', default: DEFAULT_BUSINESS_CURRENCY })
  revenueBudgetCurrency!: BusinessCurrency;

  @Column({ type: 'bigint', name: 'expense_budget_cdf', default: 0, transformer: moneyTransformer })
  expenseBudgetCdf!: number;

  @Column({ type: 'varchar', length: 3, name: 'expense_budget_currency', default: DEFAULT_BUSINESS_CURRENCY })
  expenseBudgetCurrency!: BusinessCurrency;

  @Column({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'updated_at' })
  updatedAt!: Date;
}
