import { DEFAULT_MAX_CAP } from '../lib/calc.ts'
import type { Employee, KpiIndicator, TeamData } from '../types.ts'

function kpi(
  id: string,
  name: string,
  weight: number,
  threshold: number,
  plan: number,
  maximum: number,
  fact: number,
  unit: string,
  inverse = false,
): KpiIndicator {
  return {
    id,
    type: 'kpi',
    name,
    weight,
    threshold,
    plan,
    maximum,
    fact,
    inverse,
    maxCap: DEFAULT_MAX_CAP,
    unit,
  }
}

export function createSeed(): TeamData {
  const employees: Employee[] = [
    {
      id: 'emp-ivanov',
      name: 'Иванов Иван',
      position: 'Директор по маркетингу',
      indicators: [
        kpi('kpi-leads', 'Количество лидов', 40, 500, 1000, 1200, 900, 'шт'),
        kpi('kpi-cpl', 'CPL / Стоимость лида', 20, 400, 300, 250, 320, '₽', true),
        {
          id: 'smart-landing',
          type: 'smart',
          name: 'Запуск нового лендинга',
          weight: 30,
          progress: 80,
        },
        {
          id: 'std-deadlines',
          type: 'standard',
          name: 'Соблюдение дедлайнов отчетности',
          weight: 10,
          score: 0,
        },
      ],
    },
    {
      id: 'emp-petrova',
      name: 'Петрова Мария',
      position: 'Руководитель отдела продаж',
      indicators: [
        kpi('kpi-revenue', 'Выручка', 50, 8, 12, 15, 13.2, 'млн ₽'),
        kpi('kpi-conversion', 'Конверсия сделок', 25, 15, 25, 35, 28, '%'),
        {
          id: 'smart-crm',
          type: 'smart',
          name: 'Внедрение CRM',
          weight: 15,
          progress: 100,
        },
        {
          id: 'std-talks',
          type: 'standard',
          name: 'Качество переговоров',
          weight: 10,
          score: 1,
        },
      ],
    },
    {
      id: 'emp-sidorov',
      name: 'Сидоров Алексей',
      position: 'Аналитик',
      indicators: [
        kpi('kpi-reports', 'Отчёты в срок', 40, 8, 12, 16, 7, 'шт'),
        kpi('kpi-accuracy', 'Точность прогноза', 30, 70, 90, 98, 75, '%'),
        {
          id: 'smart-board',
          type: 'smart',
          name: 'Дашборд для совета директоров',
          weight: 20,
          progress: 40,
        },
        {
          id: 'std-comms',
          type: 'standard',
          name: 'Коммуникация с заказчиками',
          weight: 10,
          score: -1,
        },
      ],
    },
    {
      id: 'emp-kozlova',
      name: 'Козлова Елена',
      position: 'HR-партнёр',
      indicators: [
        kpi('kpi-vacancies', 'Закрытые вакансии', 35, 4, 8, 12, 8, 'шт'),
        kpi('kpi-turnover', 'Текучесть', 25, 18, 12, 8, 11, '%', true),
        {
          id: 'smart-onboarding',
          type: 'smart',
          name: 'Программа адаптации',
          weight: 25,
          progress: 60,
        },
        {
          id: 'std-hiring',
          type: 'standard',
          name: 'Соблюдение регламента найма',
          weight: 15,
          score: 0,
        },
      ],
    },
    {
      id: 'emp-volkov',
      name: 'Волков Павел',
      position: 'Руководитель продукта',
      indicators: [
        kpi('kpi-nps', 'NPS продукта', 30, 20, 40, 60, 55, 'п.'),
        kpi('kpi-release', 'Срок релиза', 30, 30, 21, 14, 18, 'дн.', true),
        {
          id: 'smart-release',
          type: 'smart',
          name: 'Запуск онбординга в продукте',
          weight: 25,
          progress: 100,
        },
        {
          id: 'std-status',
          type: 'standard',
          name: 'Прозрачность статусов',
          weight: 15,
          score: 2,
        },
      ],
    },
  ]

  return {
    periodLabel: 'Октябрь 2026',
    employees,
  }
}
