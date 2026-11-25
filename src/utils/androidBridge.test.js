import {
  androidListPrintersDetailed,
  androidPrinterTarget,
  androidPrintFormatted,
} from "./androidBridge";

const receipt = { name: "Receipt Printer", address: "01:23:45:67:89:AB" };
const kitchen = { name: "Kitchen Printer", address: "01:23:45:67:89:CD" };

afterEach(() => {
  delete window.AndroidPrinter;
});

test("reads the paired devices from the previous Android app", () => {
  window.AndroidPrinter = {
    listBluetoothPrinters: () => JSON.stringify({ printers: [receipt] }),
  };

  expect(androidListPrintersDetailed()).toEqual([receipt]);
});

test("routes a raw ticket to the saved printer and preserves control bytes", () => {
  const printToAddress = jest.fn(() => true);
  window.AndroidPrinter = {
    listPrintersDetailed: () => JSON.stringify([receipt, kitchen]),
    printToAddress,
  };

  const target = androidPrinterTarget("Kitchen Printer (01:23:45:67:89:cd)", "kitchen");
  const ticket = "\x1B\x40Boonz\n\x1D\x56\x00";
  androidPrintFormatted(ticket, target);

  expect(printToAddress).toHaveBeenCalledWith(kitchen.address, ticket);
});

test("requires a saved printer when several Bluetooth devices are paired", () => {
  window.AndroidPrinter = {
    listPrintersDetailed: () => JSON.stringify([receipt, kitchen]),
  };

  expect(() => androidPrinterTarget("", "receipt")).toThrow("Select and save your receipt printer");
});

test("reports the Android error when the printer fails", () => {
  window.AndroidPrinter = {
    printToAddress: () => false,
    getLastError: () => "This printer is no longer paired.",
  };

  expect(() => androidPrintFormatted("Boonz receipt", { address: receipt.address }))
    .toThrow("This printer is no longer paired.");
});
