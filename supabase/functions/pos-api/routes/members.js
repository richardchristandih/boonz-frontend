import express from "npm:express@4.22.3";
import auth from "../middleware/authMiddleware.js";
import requireAdmin from "../middleware/requireAdmin.js";
import {
  findMember, getMembershipProgram, hasMembershipAccess, listMembers, listMembershipStaff, memberActivity, requestError,
  saveMember, saveMemberReward, setMembershipProgram, setMembershipStaff, uuidPattern,
} from "../membership.js";

const router = express.Router();
router.use(auth);

const handle = (handler) => async (req, res, next) => {
  try {
    await handler(req, res);
  } catch (error) {
    next(error);
  }
};

function memberId(req) {
  if (!uuidPattern.test(req.params.id)) throw requestError("Member not found.", 404);
  return req.params.id;
}

router.get("/access", handle(async (req, res) => {
  res.json({ allowed: await hasMembershipAccess(req.user) });
}));
router.get("/staff", requireAdmin, handle(async (_req, res) => res.json(await listMembershipStaff())));
router.put("/staff/:userId", requireAdmin, handle(async (req, res) =>
  res.json(await setMembershipStaff(req.params.userId, req.body?.allowed))));

router.use(async (req, res, next) => {
  try {
    if (!await hasMembershipAccess(req.user)) {
      return res.status(403).json({ message: "Ask a Boonz admin to give your cashier account membership access." });
    }
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/", handle(async (req, res) => {
  const page = Number(req.query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw requestError("Invalid member page.");
  res.json(await listMembers({ q: req.query.q, offset: (page - 1) * 30 }));
}));
router.post("/", handle(async (req, res) => res.status(201).json(await saveMember(req.body))));
router.post("/lookup", handle(async (req, res) => res.json(await findMember(req.body?.identifier))));
router.get("/program", handle(async (_req, res) => res.json(await getMembershipProgram())));
router.put("/program", requireAdmin, handle(async (req, res) => res.json(await setMembershipProgram(req.body))));
router.put("/rewards/:productId", requireAdmin, handle(async (req, res) =>
  res.json(await saveMemberReward(req.params.productId, req.body))));
router.get("/:id/activity", handle(async (req, res) => res.json(await memberActivity(memberId(req)))));
router.patch("/:id", requireAdmin, handle(async (req, res) => res.json(await saveMember(req.body, memberId(req)))));

export default router;
