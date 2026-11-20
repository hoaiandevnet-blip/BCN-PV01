export const testPersons = (count = 1) => Array.from({ length: count }, (_, index) => ({
  name: `Đối tượng kiểm thử ${index + 1}`, gender: index % 2 ? 'FEMALE' : 'MALE',
  date_of_birth: '1990-02-15', identity_number: String(index + 1).padStart(12, '0'),
  permanent_address: `Thường trú giả lập ${index + 1}`,
  current_address: `Nơi ở hiện tại giả lập ${index + 1}`
}));

export async function fillPersons(form, persons = testPersons()) {
  await form.locator('[name="person_count"]').selectOption(String(persons.length));
  for (const [index, person] of persons.entries()) {
    for (const [key, value] of Object.entries(person)) {
      if (key === 'reference') continue;
      const field = form.locator(`[name="person_${index}_${key}"]`);
      if (key === 'gender') await field.selectOption(value);
      else await field.fill(value);
    }
  }
}
