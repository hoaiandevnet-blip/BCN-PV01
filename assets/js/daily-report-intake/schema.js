(() => {
  const security = [
    ['AN_CHINH_TRI', 'a) Tình hình an ninh chính trị', 'ANQG'],
    ['AN_TON_GIAO', 'b) Tình hình an ninh tôn giáo', 'ANQG'],
    ['AN_CONG_NHAN', 'c) Tình hình an ninh công nhân', 'ANQG'],
    ['AN_NOI_BO', 'd) Tình hình an ninh chính trị nội bộ', 'ANQG'],
    ['AN_NONG_THON', 'đ) Tình hình an ninh nông thôn', 'ANQG'],
    ['AN_DAN_TOC', 'e) Tình hình an ninh dân tộc', 'ANQG']
  ];
  const order = [
    ['TTXH', 'a) Tình hình tội phạm xâm phạm TTXH', 'PPHS'],
    ['MA_TUY', 'b) Tình hình tội phạm và vi phạm pháp luật về ma túy', 'MA_TUY'],
    ['KINH_TE', 'c) Tội phạm và vi phạm pháp luật về kinh tế', 'KINH_TE'],
    ['MOI_TRUONG', 'd) Tội phạm và vi phạm pháp luật về môi trường', 'MOI_TRUONG'],
    ['GIAO_THONG', 'e) Tình hình trật tự, an toàn giao thông', 'TNGT']
  ];
  const groups = [
    ['Thu hồi vũ khí, vật liệu nổ, công cụ hỗ trợ', [
      ['guns', 'Súng tiếp nhận', 'khẩu'],
      ['ammunition', 'Đạn tiếp nhận', 'viên'],
      ['primitive_weapons', 'Vũ khí thô sơ (dao, kiếm…) tiếp nhận', 'vũ khí'],
      ['explosives', 'Thuốc nổ tiếp nhận', 'kg', true],
      ['fireworks', 'Pháo tiếp nhận', 'kg', true]
    ]],
    ['Kiểm danh, kiểm diện, gọi hỏi, răn đe, giáo dục', [
      ['community_sentences', 'Đối tượng chấp hành án tại cấp xã', 'đối tượng'],
      ['released_prisoners', 'Đối tượng chấp hành xong án phạt tù về cư trú tại địa phương', 'đối tượng'],
      ['parole', 'Đối tượng tha tù trước thời hạn có điều kiện', 'đối tượng'],
      ['delinquent_youth', 'Thanh thiếu niên hư, vi phạm pháp luật', 'đối tượng'],
      ['community_rehabilitation', 'Đối tượng cai nghiện tại cộng đồng', 'đối tượng'],
      ['suspected_drug_users', 'Đối tượng nghi sử dụng trái phép chất ma túy', 'đối tượng']
    ]],
    ['Kiểm tra cơ sở và xử lý vi phạm về cư trú', [
      ['accommodation_checks', 'Cơ sở lưu trú đã kiểm tra', 'cơ sở'],
      ['conditional_business_checks', 'Cơ sở kinh doanh có điều kiện về ANTT đã kiểm tra', 'cơ sở'],
      ['residence_violators', 'Cá nhân/tổ chức vi phạm đã lập biên bản', 'cá nhân/tổ chức'],
      ['residence_penalties', 'Quyết định xử phạt VPHC lĩnh vực cư trú', 'quyết định'],
      ['residence_fines', 'Tổng tiền phạt lĩnh vực cư trú', 'đồng']
    ]],
    ['Tuyên truyền, tuần tra, kiểm soát trật tự an toàn giao thông', [
      ['traffic_campaigns', 'Đợt tuyên truyền, phổ biến pháp luật về TTATGT', 'đợt'],
      ['traffic_participants', 'Người dân được tuyên truyền, vận động về TTATGT', 'lượt'],
      ['traffic_violations', 'Trường hợp vi phạm TTATGT đã lập biên bản', 'trường hợp'],
      ['traffic_penalties', 'Quyết định xử phạt VPHC lĩnh vực TTATGT', 'quyết định'],
      ['traffic_fines', 'Tổng tiền phạt lĩnh vực TTATGT', 'triệu đồng', true]
    ]],
    ['Tuyên truyền, kiểm tra và xử lý vi phạm về PCCC', [
      ['fire_campaigns', 'Đợt tuyên truyền, phổ biến pháp luật, kỹ năng PCCC', 'đợt'],
      ['fire_participants', 'Cá nhân/tổ chức được tuyên truyền PCCC', 'lượt'],
      ['fire_checks', 'Cá nhân/tổ chức được kiểm tra an toàn PCCC', 'cá nhân/tổ chức'],
      ['fire_violations', 'Trường hợp vi phạm PCCC đã lập biên bản', 'trường hợp'],
      ['fire_penalties', 'Quyết định xử phạt VPHC lĩnh vực PCCC', 'quyết định'],
      ['fire_fines', 'Tổng tiền phạt lĩnh vực PCCC', 'triệu đồng', true],
      ['fire_temporary_suspensions', 'Quyết định tạm đình chỉ hoạt động', 'quyết định'],
      ['fire_suspensions', 'Quyết định đình chỉ hoạt động', 'quyết định']
    ]]
  ];
  const workDomains = [
    'Lĩnh vực cư trú',
    'Lĩnh vực ngành nghề kinh doanh có điều kiện về ANTT',
    'Lĩnh vực TTATGT',
    'Lĩnh vực Kinh tế, Môi trường',
    'Lĩnh vực PCCC',
    'Lĩnh vực khác',
    'Lĩnh vực ANTT - ATXH'
  ];
  const administrativeGroup = ['Kết quả Xử lý VPHC', [
    ['administrative_checks', 'Kiểm tra hành chính', 'trường hợp'],
    ['administrative_violation_records', 'Lập Biên bản Xử phạt VPHC', 'trường hợp'],
    ['administrative_penalty_decisions', 'Ban hành Quyết định Xử phạt VPHC', 'trường hợp'],
    ['administrative_fines', 'Tổng tiền', 'đồng']
  ]];
  const administrativeFields = administrativeGroup[1];
  const patrolGroup = ['Tuần tra, kiểm soát', [
    ['patrol_officers', 'Số CBCS', ''],
    ['patrol_rounds', 'Số lượt', ''],
    ['patrol_vehicles_checked', 'Số phương tiện đã kiểm tra', ''],
    ['patrol_vehicles_detained', 'Số phương tiện tạm giữ', ''],
    ['patrol_violations', 'Số vụ vi phạm pháp luật', ''],
    ['patrol_documents_detained', 'Số giấy tờ tạm giữ', '']
  ]];
  const patrolFields = patrolGroup[1];
  const legacyPatrolFields = patrolFields.filter(([key]) => key !== 'patrol_vehicles_checked');
  globalThis.DailyReportIntakeSchema = {
    categories: [
      ['1. Tình hình an ninh quốc gia', security],
      ['2. Tình hình an ninh trật tự, an toàn xã hội', order]
    ],
    groups,
    fields: groups.flatMap(([, fields]) => fields),
    legacyFields: groups.flatMap(([, fields]) => fields),
    entryGroups: groups.slice(0, 2),
    legacyEntryFields: groups.slice(0, 2).flatMap(([, fields]) => fields),
    entryFields: [...groups.slice(0, 2).flatMap(([, fields]) => fields), ...administrativeFields, ...patrolFields],
    administrativeGroup,
    administrativeFields,
    patrolGroup,
    patrolFields,
    legacyPatrolFields,
    workDomains,
    formatValues(values, weaponType = '', workDomain = '', administrativeDomains = []) {
      const multi = Array.isArray(administrativeDomains) && administrativeDomains.length > 0;
      const hasAdministrativeFields = administrativeFields.some(([key]) => Object.hasOwn(values, key));
      const formatted = [...groups, administrativeGroup].map(([label, fields], index) => {
        if (multi && index === groups.length) return '';
        const present = fields.filter(([key]) => Object.hasOwn(values, key));
        if (!present.length) return '';
        const domainGroup = hasAdministrativeFields ? index === groups.length : index === 1;
        const domain = domainGroup && workDomain ? ` (${workDomain})` : '';
        return `${label}${domain}: ` + present.map(([key, name, unit]) =>
          `${name}: ${values[key]} ${unit}${key === 'primitive_weapons' && weaponType
            ? ` (${weaponType})` : ''}`).join('; ');
      }).filter(Boolean);
      if (multi) {
        for (const entry of administrativeDomains) {
          const entries = administrativeFields.filter(([key]) => Object.hasOwn(entry.values || {}, key));
          formatted.push(`${administrativeGroup[0]} (${entry.domain}): ` + entries.map(([key, label, unit]) =>
            `${label}: ${entry.values[key]} ${unit}`).join('; '));
        }
      }
      const presentPatrol = patrolFields.filter(([key]) => Object.hasOwn(values, key));
      if (presentPatrol.length) {
        formatted.push(`${patrolGroup[0]}: ` + presentPatrol.map(([key, label]) =>
          `${label}: ${values[key]}`).join('; '));
      }
      return formatted.join('\n');
    },
    metricCode: 'DAILY_POLICE_WORK'
  };
})();
