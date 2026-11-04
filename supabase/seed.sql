-- DADOS FICTÍCIOS para homologação e testes. Nenhum dado real do shopping.
-- Usuários de teste são criados pelo script scripts/criar-usuarios-teste.ts
-- (o login precisa passar pelo serviço de autenticação).

insert into public.segmentos (nome) values
  ('Alimentação'), ('Calçados'), ('Moda'), ('Serviços'), ('Eletrônicos'),
  ('Farmácia'), ('Óticas'), ('Entretenimento'), ('Conveniência');

with dados (luc, nome, localizacao, segmento, auditada, ativa, pct, minimo) as (values
  ('LJ 101/102/102A', 'Moda Fictícia Atacarejo',     'Piso L1 – corredor A',        'Moda',          true,  true,  6.0, 18500.00),
  ('LJ 103',          'Calçados Exemplo',            'Piso L1 – corredor A',        'Calçados',      true,  true,  7.0,  9200.00),
  ('LJ 104',          'Ótica Modelo',                'Piso L1 – corredor B',        'Óticas',        true,  true,  8.0,  6100.00),
  ('LJ 105',          'Farmácia Teste',              'Piso L1 – entrada principal', 'Farmácia',      true,  true,  3.5, 14000.00),
  ('LJ 110',          'Eletro Demonstração',         'Piso L1 – corredor C',        'Eletrônicos',   true,  true,  4.0, 22000.00),
  ('LJ 201',          'Boutique Imaginária',         'Piso L2 – corredor A',        'Moda',          true,  true,  7.5,  7800.00),
  ('LJ 202/203',      'Esportes Hipotéticos',        'Piso L2 – corredor A',        'Moda',          true,  true,  6.5, 12500.00),
  ('LJ 204',          'Relojoaria Simulada',         'Piso L2 – corredor B',        'Moda',          true,  true,  8.0,  5400.00),
  ('LJ 205',          'Papelaria Fictícia',          'Piso L2 – corredor B',        'Conveniência',  true,  true,  6.0,  4300.00),
  ('LJ 210',          'Cine Exemplo',                'Piso L3',                     'Entretenimento',false, true,  5.0, 30000.00),
  ('LJ 211',          'Academia Teste',              'Piso L3',                     'Serviços',      false, true,  4.5, 16000.00),
  ('PA 01',           'Restaurante Sabor Fictício',  'Praça de alimentação',        'Alimentação',   true,  true,  7.0,  8800.00),
  ('PA 02',           'Lanchonete Modelo',           'Praça de alimentação',        'Alimentação',   true,  true,  7.0,  6900.00),
  ('PA 03',           'Pizzaria Demonstração',       'Praça de alimentação',        'Alimentação',   true,  true,  7.0,  7200.00),
  ('Q 001C',          'Quiosque Capinhas Teste',     'Piso L1 – praça central',     'Eletrônicos',   true,  true,  10.0, 2500.00),
  ('Q 002',           'Quiosque Sorvete Exemplo',    'Piso L1 – praça central',     'Alimentação',   true,  true,  10.0, 2200.00),
  ('ILHA 001/002',    'Ilha Café Fictício',          'Piso L2 – praça',             'Alimentação',   true,  true,  9.0,  3100.00),
  ('ILHA 003',        'Ilha Perfumes Modelo',        'Piso L2 – praça',             'Moda',          true,  true,  9.0,  2900.00),
  ('T1',              'Loja Âncora Imaginária',      'Térreo – ala norte',          'Moda',          true,  true,  2.5, 45000.00),
  ('LJ 120',          'Chaveiro Hipotético',         'Piso L1 – estacionamento',    'Serviços',      false, true,  null, 1500.00),
  ('LJ 130',          'Loja Antiga Encerrada',       'Piso L1 – corredor D',        'Moda',          true,  false, 6.0,  5000.00)
),
lojas_ins as (
  insert into public.lojas (luc, nome_fantasia, localizacao, segmento_id, auditada, ativa)
  select d.luc, d.nome, d.localizacao, s.id, d.auditada, d.ativa
    from dados d left join public.segmentos s on s.nome = d.segmento
  returning id, luc
),
pct as (
  insert into public.loja_percentuais (loja_id, vigencia_inicio, percentual)
  select l.id, date '2026-01-01', d.pct from lojas_ins l join dados d using (luc) where d.pct is not null
  returning 1
)
insert into public.loja_alugueis_minimos (loja_id, vigencia_inicio, valor)
select l.id, date '2026-01-01', d.minimo from lojas_ins l join dados d using (luc);

-- Reajuste fictício a partir de 07/2026 para duas lojas (exemplo de vigência)
insert into public.loja_alugueis_minimos (loja_id, vigencia_inicio, valor)
select id, date '2026-07-01', 19800.00 from public.lojas where luc = 'LJ 101/102/102A';
insert into public.loja_percentuais (loja_id, vigencia_inicio, percentual)
select id, date '2026-07-01', 7.25 from public.lojas where luc = 'LJ 103';

-- 13º aluguel fictício de 2026 para algumas lojas
insert into public.loja_aluguel_dezembro (loja_id, ano, valor)
select id, 2026, valor from (values
  ('LJ 101/102/102A', 39600.00), ('LJ 103', 18400.00), ('T1', 90000.00), ('PA 01', 17600.00)
) v (luc, valor) join public.lojas using (luc);
