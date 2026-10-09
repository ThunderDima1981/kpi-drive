import { DEFAULT_MAX_CAP, defaultStandardPoints, pointsFromLegacyScale } from '../lib/calc.ts'
import type {
  CatalogKpi,
  Employee,
  KpiIndicator,
  SmartComment,
  SmartIndicator,
  SmartStatus,
  SmartTask,
  StandardIndicator,
  TeamData,
} from '../types.ts'

function smart(
  id: string,
  name: string,
  weight: number,
  status: SmartStatus,
  detail: string,
  criterion: string,
  comments: SmartComment[] = [],
): SmartIndicator {
  const task: SmartTask = {
    id: `${id}-task`,
    name,
    weight: 100,
    detail,
    criterion,
    status,
    comments,
  }
  return { id, type: 'smart', weight, tasks: [task] }
}

function standard(
  id: string,
  name: string,
  weight: number,
  score: number,
  evaluatorId: string,
): StandardIndicator {
  return { id, type: 'standard', name, weight, score, evaluatorId, points: defaultStandardPoints() }
}

function kpi(
  catalog: CatalogKpi[],
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
  catalog.push({
    id,
    name,
    unit,
    fact,
    points: pointsFromLegacyScale(id, {
      threshold,
      plan,
      maximum,
      fact,
      inverse,
      maxCap: DEFAULT_MAX_CAP,
    }),
  })
  return { id, type: 'kpi', catalogId: id, weight }
}

export function createSeed(): TeamData {
  const kpiCatalog: CatalogKpi[] = []
  const employees: Employee[] = [
    {
      id: 'emp-ivanov',
      name: 'Иванов Иван',
      position: 'Директор по маркетингу',
      managerId: null,
      indicators: [
        kpi(kpiCatalog, 'kpi-leads', 'Количество лидов', 40, 500, 1000, 1200, 900, 'шт'),
        kpi(kpiCatalog, 'kpi-cpl', 'CPL / Стоимость лида', 20, 400, 300, 250, 320, '₽', true),
        smart(
          'smart-landing',
          'Запуск нового лендинга',
          30,
          'in_progress',
          'Собрать структуру страницы, тексты оффера и форму заявки. Публикация после согласования с продажами.',
          'Лендинг опубликован, форма пишет лиды в CRM, на странице нет критичных ошибок.',
          [
            {
              id: 'cmt-landing-1',
              text: 'Макет главной согласован. Ждём тексты для блока услуг.',
              createdAt: '2026-10-03T09:30:00.000Z',
            },
          ],
        ),
        standard('std-deadlines', 'Соблюдение дедлайнов отчетности', 10, 0, 'emp-petrova'),
      ],
    },
    {
      id: 'emp-petrova',
      name: 'Петрова Мария',
      position: 'Руководитель отдела продаж',
      managerId: null,
      indicators: [
        kpi(kpiCatalog, 'kpi-revenue', 'Выручка', 50, 8, 12, 15, 13.2, 'млн ₽'),
        kpi(kpiCatalog, 'kpi-conversion', 'Конверсия сделок', 25, 15, 25, 35, 28, '%'),
        smart(
          'smart-crm',
          'Внедрение CRM',
          15,
          'closed',
          'Перевести отдел продаж на единую воронку и подключить источники лидов.',
          'Менеджеры ведут сделки только в CRM, отчёт по воронке строится без ручной выгрузки.',
          [
            {
              id: 'cmt-crm-1',
              text: 'Воронка включена, обучение отдела проведено.',
              createdAt: '2026-10-06T14:00:00.000Z',
            },
          ],
        ),
        standard('std-talks', 'Качество переговоров', 10, 1, 'emp-ivanov'),
      ],
    },
    {
      id: 'emp-sidorov',
      name: 'Сидоров Алексей',
      position: 'Аналитик',
      managerId: 'emp-ivanov',
      indicators: [
        kpi(kpiCatalog, 'kpi-reports', 'Отчёты в срок', 40, 8, 12, 16, 7, 'шт'),
        kpi(kpiCatalog, 'kpi-accuracy', 'Точность прогноза', 30, 70, 90, 98, 75, '%'),
        smart(
          'smart-board',
          'Дашборд для совета директоров',
          20,
          'created',
          'Собрать на одном экране выручку, лиды и выполнение матриц за месяц.',
          'Совет открывает дашборд без выгрузки из таблиц, цифры совпадают с учётной системой.',
        ),
        standard('std-comms', 'Коммуникация с заказчиками', 10, -1, 'emp-ivanov'),
      ],
    },
    {
      id: 'emp-kozlova',
      name: 'Козлова Елена',
      position: 'HR-партнёр',
      managerId: null,
      indicators: [
        kpi(kpiCatalog, 'kpi-vacancies', 'Закрытые вакансии', 35, 4, 8, 12, 8, 'шт'),
        kpi(kpiCatalog, 'kpi-turnover', 'Текучесть', 25, 18, 12, 8, 11, '%', true),
        smart(
          'smart-onboarding',
          'Программа адаптации',
          25,
          'done',
          'Описать первые 30 дней для новых сотрудников и чек-лист руководителя.',
          'Программа утверждена, по ней прошёл хотя бы один новый сотрудник.',
        ),
        standard('std-hiring', 'Соблюдение регламента найма', 15, 0, 'emp-petrova'),
      ],
    },
    {
      id: 'emp-volkov',
      name: 'Волков Павел',
      position: 'Руководитель продукта',
      managerId: null,
      indicators: [
        kpi(kpiCatalog, 'kpi-nps', 'NPS продукта', 30, 20, 40, 60, 55, 'п.'),
        kpi(kpiCatalog, 'kpi-release', 'Срок релиза', 30, 30, 21, 14, 18, 'дн.', true),
        smart(
          'smart-release',
          'Запуск онбординга в продукте',
          25,
          'closed',
          'Показать новому пользователю первый сценарий за три шага.',
          'Онбординг включён на всех новых аккаунтах, до конца сценария доходят не меньше 60%.',
        ),
        standard('std-status', 'Прозрачность статусов', 15, 2, 'emp-ivanov'),
      ],
    },
  ]

  return {
    periodLabel: 'Октябрь 2026',
    employees,
    kpiCatalog,
  }
}
