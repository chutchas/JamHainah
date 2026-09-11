-- ============================================================
-- 0010 — ป้ายปุ่มสั้นลง และไม่มี emoji นำหน้าแล้ว
-- ============================================================
--
-- ปุ่มทั้งหมดย้ายจาก Flex card ไปอยู่ที่ quick reply
-- เพราะ quick reply ใส่ไอคอนรูปของเราเองได้ (Flex ใส่ไม่ได้)
-- และมันหายไปเองเมื่อมีข้อความใหม่ ผู้ใช้จะได้ไม่เลื่อนขึ้นไปกดปุ่มของเมื่อเดือนที่แล้ว
--
-- แต่ quick reply จำกัดป้ายไว้ที่ 20 ตัวอักษร ยาวกว่านั้น LINE ตอบ 400 ทั้งก้อน
-- แล้วผู้ใช้จะเจอความเงียบ เพราะ reply token ถูกใช้ไปแล้ว
-- "📍 ที่ว่าการอำเภอใกล้ฉัน" = 23 ตัว จึงต้องสั้นลงจริง ๆ ไม่ใช่แค่ตัดทิ้ง
--
-- ส่วน emoji นำหน้าเอาออก เพราะตอนนี้มีไอคอนจริงอยู่ทางซ้ายปุ่มแล้ว
-- ------------------------------------------------------------
update public.renew_actions set label = 'ให้เราต่อให้'      where doc_type = 'vehicle_tax'        and kind = 'upsell';
update public.renew_actions set label = 'ต่อภาษีออนไลน์'     where doc_type = 'vehicle_tax'        and kind = 'link';
update public.renew_actions set label = 'ตรอ. ใกล้ฉัน'       where doc_type = 'vehicle_tax'        and kind = 'location';
update public.renew_actions set label = 'ให้เราต่อให้'       where doc_type = 'cmi'                and kind = 'upsell';
update public.renew_actions set label = 'ร้านต่อ พ.ร.บ.'     where doc_type = 'cmi'                and kind = 'location';
update public.renew_actions set label = 'เทียบราคาให้'       where doc_type = 'motor_insurance'    and kind = 'upsell';
update public.renew_actions set label = 'ตรอ. ใกล้ฉัน'       where doc_type = 'vehicle_inspection' and kind = 'location';
update public.renew_actions set label = 'อบรมออนไลน์ก่อน'    where doc_type = 'driving_license'    and kind = 'link';
update public.renew_actions set label = 'สำนักงานขนส่ง'      where doc_type = 'driving_license'    and kind = 'location';
update public.renew_actions set label = 'ที่ว่าการอำเภอ'      where doc_type = 'national_id'        and kind = 'location';
update public.renew_actions set label = 'จองคิวพาสปอร์ต'     where doc_type = 'passport'           and kind = 'link';
update public.renew_actions set label = 'สนง.หนังสือเดินทาง'  where doc_type = 'passport'           and kind = 'location';
update public.renew_actions set label = 'ประกันสังคมออนไลน์' where doc_type = 'social_security'    and kind = 'link';
update public.renew_actions set label = 'สนง.ประกันสังคม'    where doc_type = 'social_security'    and kind = 'location';
update public.renew_actions set label = 'ตรวจคนเข้าเมือง'    where doc_type = 'visa'               and kind = 'link';
update public.renew_actions set label = 'สนง.ตม. ใกล้ฉัน'    where doc_type = 'visa'               and kind = 'location';
update public.renew_actions set label = 'สนง.จัดหางาน'       where doc_type = 'work_permit'        and kind = 'location';
