import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import api from "./services/api";

jest.mock("./pages/MainMenu", () => () => "Register");
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
