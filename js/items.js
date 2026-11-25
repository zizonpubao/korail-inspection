/* 점검 항목 데이터 (시연용 예시). 데이터만 둔다. key는 한 번 정하면 바꾸지 않는다. */
window.ITEMS = {
  version: 'demo-2026-11',
  notice: '본 점검 항목과 기준치는 공개 자료를 바탕으로 만든 시연용 예시이며 실제 정비 지침이 아닙니다.',
  vehicles: ['KTX-산천', 'KTX-청룡', 'SRT'],
  types: ['일상점검', '월상점검'],
  urgency: [
    { key: 'immediate', label: '즉시 조치', rank: 1 },
    { key: 'today', label: '금일 내', rank: 2 },
    { key: 'next', label: '다음 정비 시', rank: 3 }
  ],
  sections: [
    {
      id: 'running', name: '주행장치',
      items: [
        { key: 'running_tread', label: '차륜 답면 찰상·박리', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'running_frame', label: '대차 프레임 균열·이물', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'running_axle_heat', label: '축상 이상 발열 흔적', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'running_damper_leak', label: '스프링·댐퍼 누유', kind: 'check', types: ['일상점검', '월상점검'] }
      ]
    },
    {
      id: 'brake', name: '제동장치',
      items: [
        { key: 'brake_test', label: '제동 작용·완해 시험', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'brake_lining_visual', label: '제동 라이닝 잔량 육안', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'brake_air_leak', label: '공기 누설음', kind: 'check', types: ['일상점검', '월상점검'] }
      ]
    },
    {
      id: 'coupler', name: '연결장치',
      items: [
        { key: 'coupler_exterior', label: '전두부 자동연결기(중련) 외관', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'coupler_hose', label: '차간 공기호스·전기 점퍼 체결', kind: 'check', types: ['일상점검', '월상점검'] }
      ]
    },
    {
      id: 'door', name: '출입문',
      items: [
        { key: 'door_operate', label: '승강문 개폐 작동', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'door_indicator', label: '닫힘 표시등·안전장치', kind: 'check', types: ['일상점검', '월상점검'] }
      ]
    },
    {
      id: 'electric', name: '집전·전기',
      items: [
        { key: 'pantograph_visual', label: '팬터그래프 습판 외관', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'lamps', label: '전조등·표지등·객실등', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'battery_display', label: '축전지 전압 표시', kind: 'check', types: ['일상점검', '월상점검'] }
      ]
    },
    {
      id: 'hvac', name: '공조·급수',
      items: [
        { key: 'hvac_operate', label: '냉난방 작동', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'water_level', label: '급수·오물탱크 수위', kind: 'check', types: ['일상점검', '월상점검'] }
      ]
    },
    {
      id: 'body', name: '차체·안전설비',
      items: [
        { key: 'body_damage', label: '차체·전두부 손상(찌그러짐 포함)', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'window_crack', label: '유리창 균열', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'safety_equip', label: '소화기·비상인터폰', kind: 'check', types: ['일상점검', '월상점검'] }
      ]
    },
    {
      id: 'cab', name: '운전실',
      items: [
        { key: 'cab_alarm_test', label: '운전실 계기·경보 시험', kind: 'check', types: ['일상점검', '월상점검'] },
        { key: 'tcms_history', label: '열차정보장치 고장 이력 확인', kind: 'check', types: ['일상점검', '월상점검'] }
      ]
    },
    {
      id: 'power', name: '동력·추진(차종별)',
      items: [
        { key: 'power_converter_fan', label: '동력차 주변환장치 냉각팬·필터', kind: 'check', types: ['일상점검', '월상점검'], vehicles: ['KTX-산천', 'SRT'] },
        { key: 'power_motor_vent', label: '동력차 견인전동기 통풍구', kind: 'check', types: ['일상점검', '월상점검'], vehicles: ['KTX-산천', 'SRT'] },
        { key: 'power_tm_ext', label: '동력대차 견인전동기 외관', kind: 'check', types: ['일상점검', '월상점검'], vehicles: ['KTX-청룡'] },
        { key: 'power_ctrl_box', label: '차량 하부 추진제어장치함 체결', kind: 'check', types: ['일상점검', '월상점검'], vehicles: ['KTX-청룡'] }
      ]
    },
    {
      id: 'measure', name: '측정 항목',
      items: [
        { key: 'm_brake_lining', label: '제동 라이닝 두께', kind: 'measure', types: ['월상점검'], unit: 'mm', min: 5.0, max: null, step: 0.1, sample: 4.2 },
        { key: 'm_flange', label: '차륜 플랜지 두께', kind: 'measure', types: ['월상점검'], unit: 'mm', min: 26.0, max: 33.0, step: 0.1, sample: 30.1 },
        { key: 'm_wheel_dia', label: '차륜 직경', kind: 'measure', types: ['월상점검'], unit: 'mm', min: 850, max: null, step: 1, sample: 862 },
        { key: 'm_pantograph', label: '팬터그래프 습판 두께', kind: 'measure', types: ['월상점검'], unit: 'mm', min: 8.0, max: null, step: 0.1, sample: 9.5 },
        { key: 'm_compressor', label: '공기압축기 토출압력', kind: 'measure', types: ['월상점검'], unit: 'bar', min: 8.0, max: 10.0, step: 0.1, sample: 9.0 },
        { key: 'm_battery_v', label: '축전지 전압', kind: 'measure', types: ['월상점검'], unit: 'V', min: 72, max: 82, step: 1, sample: 77 }
      ]
    },
    {
      id: 'monthly', name: '월상 세부 점검',
      items: [
        { key: 'mo_wheel_ut', label: '차륜 초음파 탐상 결과 확인', kind: 'check', types: ['월상점검'] },
        { key: 'mo_hvac_filter', label: '공조 필터 청소·교체', kind: 'check', types: ['월상점검'] },
        { key: 'mo_door_emergency', label: '승강문 비상 개방장치 시험', kind: 'check', types: ['월상점검'] },
        { key: 'mo_extinguisher_gauge', label: '소화기 압력게이지', kind: 'check', types: ['월상점검'] },
        { key: 'mo_grounding', label: '접지장치 상태', kind: 'check', types: ['월상점검'] }
      ]
    }
  ],
  // 예시 데이터 채우기용 (측정 항목 중 m_brake_lining만 기준치 밖 sample 값)
  sampleDefects: [
    { key: 'body_damage', urgency: 'today', memo: '2호차 측면 하단 찌그러짐 약 5cm (예시)' },
    { key: 'brake_air_leak', urgency: 'immediate', memo: '3호차 대차 부근 공기 누설음 (예시)' },
    { key: 'door_indicator', urgency: 'next', memo: '5호차 출입문 닫힘 표시등 간헐 점멸 (예시)' }
  ]
};
