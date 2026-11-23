import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmProvider } from "./components/ConfirmDialog";
import api from "./services/api";
import MemberCheckout from "./components/MemberCheckout";

jest.mock("./pages/MainMenu", () => () => "Register");
jest.mock("./utils/productImage", () => ({ getImageSrc: () => null }));
jest.mock("./pages/PublicMenu", () => () => "Public menu");
jest.mock("./services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));

const milk = { _id: "milk", name: "Fresh milk", unit: "liter", category: "Barista", quantity: 4 };

beforeEach(() => {
  localStorage.setItem("user", JSON.stringify({ name: "Staff", role: "user" }));
  window.history.replaceState({}, "", "/inventory");
});

afterEach(() => {
  localStorage.clear();
  jest.resetAllMocks();
});

test("a failed inventory load can be retried without offering to initialize stock", async () => {
  api.get.mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce({ data: [] });
  render(<App />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load inventory.");
  expect(screen.queryByRole("button", { name: "Add default items" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect(await screen.findByRole("button", { name: "Add default items" })).toBeEnabled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test("inventory keeps typed quantities through errors and updates only the saved row", async () => {
  api.get.mockResolvedValue({ data: [milk] });
  api.patch.mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValueOnce({ data: { ...milk, quantity: 2.5 } });
  render(<App />);

  const quantity = await screen.findByRole("spinbutton", { name: "Fresh milk quantity" });
  fireEvent.change(quantity, { target: { value: "2.5" } });
  expect(quantity).toHaveValue(2.5);

  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Couldn’t save the quantity. Try again.")).toBeInTheDocument();
  expect(quantity).toHaveValue(2.5);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
  expect(api.patch).toHaveBeenLastCalledWith("/inventory/milk/quantity", { quantity: 2.5 });
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(quantity).toHaveValue(2.5);
});

test("sales rankings and payment totals exclude refunded orders", async () => {
  localStorage.setItem("user", JSON.stringify({ name: "Admin", role: "admin" }));
  window.history.replaceState({}, "", "/dashboard");
  api.get.mockResolvedValue({
    data: [
      { _id: "paid", status: "done", paymentMethod: "QRIS", totalAmount: 20000, createdAt: "2025-01-03T12:00:00Z",
        products: [{ productId: "coffee", name: "Americano", quantity: 1, price: 20000 }] },
      { _id: "refund", status: "refunded", paymentMethod: "Credit Card", totalAmount: 50000, createdAt: "2025-01-03T12:00:00Z",
        products: [{ productId: "cake", name: "Refunded cake", quantity: 1, price: 50000 }] },
    ],
  });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "All time" }));

  expect(await screen.findByRole("rowheader", { name: "Americano" })).toBeInTheDocument();
  expect(screen.getByText("QRIS")).toBeInTheDocument();
  expect(screen.queryByText("Credit Card")).not.toBeInTheDocument();
  expect(screen.queryByText("Refunded cake")).not.toBeInTheDocument();
});


test("cashier can search by name, inspect membership, and choose an affordable reward", async () => {
  const member = { id: "member-1", name: "Ari", email: "ari@example.test", phone: "+6281234567890", points: 4 };
  const reward = { productId: "coffee", name: "Americano", points: 3, active: true };
  api.post.mockResolvedValue({ data: { items: [member], hasMore: false } });
  api.get.mockResolvedValue({ data: { rupiahPerPoint: 10000, redemptionValue: 1000, rewards: [
    reward,
    { productId: "cake", name: "Cheesecake", points: 5, active: true },
  ] } });
  const props = {
    setMember: jest.fn(), setBenefit: jest.fn(), onBusyChange: jest.fn(),
    onContinue: jest.fn(), onSkip: jest.fn(), hasItems: true, total: 20000,
  };
  const { rerender } = render(<MemberCheckout {...props} member={null} benefit={null} />);

  fireEvent.change(screen.getByLabelText("Name, email, or phone number"), { target: { value: "Ari" } });
  fireEvent.click(screen.getByRole("button", { name: "Find member" }));
  fireEvent.click(await screen.findByRole("button", { name: /Ari/ }));
  expect(api.post).toHaveBeenCalledWith("/members/search", { q: "Ari" });
  expect(props.setMember).toHaveBeenCalledWith(member);

  rerender(<MemberCheckout {...props} member={member} benefit={null} />);
  const list = await screen.findByRole("region", { name: "Redeem a reward" });
  expect(within(list).getByRole("button", { name: /Cheesecake.*Need 1 more/ })).toBeDisabled();
  const affordable = within(list).getByRole("button", { name: /Americano.*Available to redeem/ });
  expect(affordable).toBeEnabled();
  fireEvent.click(affordable);
  expect(props.setBenefit).toHaveBeenLastCalledWith({ ...reward, kind: "reward" });
  expect(screen.getByRole("radio", { name: "Redeem an item" })).toBeChecked();
  expect(screen.getByText("ari@example.test · +6281234567890")).toBeInTheDocument();
});

test("cashier can skip without any details or exchange points for a discount", async () => {
  const member = { id: "member-1", name: "Ari", email: "ari@example.test", phone: "+6281234567890", points: 4 };
  api.get.mockResolvedValue({ data: { rupiahPerPoint: 10000, redemptionValue: 1000, rewards: [] } });
  const props = {
    setMember: jest.fn(), setBenefit: jest.fn(), onBusyChange: jest.fn(),
    onContinue: jest.fn(), onSkip: jest.fn(), hasItems: true, total: 20000,
  };
  const { rerender } = render(<MemberCheckout {...props} member={null} benefit={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Skip membership" }));
  expect(props.onSkip).toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();

  rerender(<MemberCheckout {...props} member={member} benefit={null} />);
  fireEvent.click(await screen.findByRole("radio", { name: "Use points to reduce the total" }));
  const input = screen.getByRole("spinbutton", { name: /Points to use/ });
  fireEvent.change(input, { target: { value: "5" } });
  expect(screen.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue to payment" }));
  expect(props.setBenefit).toHaveBeenLastCalledWith({ kind: "discount", points: 3, value: 1000 });
  expect(props.onContinue).toHaveBeenCalled();
});

test("membership directory tells cashiers when an administrator must approve access", async () => {
  window.history.replaceState({}, "", "/members");
  api.get.mockResolvedValue({ data: { allowed: false } });
  render(<App />);

  expect(await screen.findByText(/Ask a Boonz admin to approve your account/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New member" })).not.toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(1);
});


test("register opens membership before payment and skipping needs no customer details", async () => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const Register = jest.requireActual("./pages/MainMenu").default;
  const product = { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Banana bread", price: 20000, category: "Food", sku: "BRD" };
  api.get.mockImplementation(async (url) => ({ data: {
    "/products": [product],
    "/categories": [],
    "/settings/order-charges": {},
    "/members/access": { allowed: true },
    "/promotions?active=true": [],
  }[url] }));

  const view = render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider><ConfirmProvider><Register /></ConfirmProvider></ToastProvider>
    </MemoryRouter>
  );
  try {
    fireEvent.click(await screen.findByRole("button", { name: /Banana bread/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review payment" }));
    const membership = screen.getByRole("dialog", { name: "Boonz membership" });
    expect(screen.queryByRole("dialog", { name: "Record payment" })).not.toBeInTheDocument();
    fireEvent.click(within(membership).getByRole("button", { name: "Register new member" }));
    expect(within(membership).getByLabelText("Phone number")).toBeRequired();
    fireEvent.click(within(membership).getByRole("button", { name: "Skip membership" }));

    const payment = screen.getByRole("dialog", { name: "Record payment" });
    expect(within(payment).getByLabelText(/Customer name/)).toHaveValue("");
    expect(within(payment).getByLabelText(/Email receipt/)).not.toBeRequired();
    fireEvent.click(within(payment).getByRole("button", { name: "QRIS" }));
    expect(within(payment).getByRole("button", { name: "Record payment" })).toBeEnabled();
    expect(api.post).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    window.matchMedia = originalMatchMedia;
  }
});
