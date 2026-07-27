-- Alinea los ids de plan con los que vende la landing (#precios):
--   trial · starter (Emprendedor) · business (Negocio) · agency (Agencia)
--
-- La 020 dejo todo en 'pro', que no existe mas. Las marcas que ya operan pasan a
-- 'agency': son las del operador, no clientes pagos, y no pueden quedar contra
-- un tope de 30 piezas de un dia para el otro.
update brands set plan = 'agency' where plan = 'pro';

-- Cualquier plan desconocido cae al de prueba, que es el default seguro.
update brands set plan = 'trial'
where plan not in ('trial', 'starter', 'business', 'agency');
