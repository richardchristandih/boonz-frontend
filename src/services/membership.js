import api from "./api";

export async function membershipProgram(options) {
  return (await api.get("/members/program", options)).data;
}

export async function findMember(identifier) {
  return (await api.post("/members/lookup", { identifier })).data;
}

export async function saveMember(details, id) {
  const response = id ? await api.patch(`/members/${id}`, details) : await api.post("/members", details);
  return response.data;
}

export const memberError = (error, fallback) => error.response?.data?.message || fallback;

export async function membershipAccess(options) {
  return (await api.get("/members/access", options)).data.allowed;
}

export async function searchMembers(q, options) {
  return (await api.post("/members/search", { q }, options)).data;
}


export async function adjustPoints(id, details) {
  return (await api.patch(`/members/${id}/points`, details)).data;
}
