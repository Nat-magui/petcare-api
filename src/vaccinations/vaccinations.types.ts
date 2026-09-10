export interface VaccinationResponse {
  id: string;
  petId: string;
  vaccineName: string;
  appliedAt: string;
  nextDueAt: string | null;
  veterinarianName: string | null;
  clinicName: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
