// src/components/PrinterTest.js
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FiPrinter } from "react-icons/fi";
import WorkspacePage from "./WorkspacePage";

// Example arrays of potential services/characteristics. Adjust as needed.
const possibleServices = [0x18F0, 0xFFF0, 0xFEE7];
const possibleCharacteristics = [0x2AF1, 0xFFF2, 0xFEC8];

// ESC/POS example: initializes printer, prints text, then line feeds
// If your printer uses CPCL or a different command set, adjust accordingly.
const escPosCommands = "\x1B\x40" + // Initialize
                       "Receipt\nOrder #1234\nItem: Cappuccino x2\nTotal: $8.98\n" +
                       "\x0A\x0A"; // Some line feeds

// Plain text example
const plainText = "Receipt\nOrder #1234\nItem: Cappuccino x2\nTotal: $8.98";

async function connectPrinter() {
  // Try each combination of service/characteristic
  for (let serviceUUID of possibleServices) {
    for (let characteristicUUID of possibleCharacteristics) {
      let deviceSelected = false;
      try {
        console.log(`Attempting service=0x${serviceUUID.toString(16)}, characteristic=0x${characteristicUUID.toString(16)}`);

        // Request the device that advertises the service
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [serviceUUID] }]
        });

        deviceSelected = true;
        const server = await device.gatt.connect();
        console.log('Connected to GATT server');

        // Get the primary service
        const service = await server.getPrimaryService(serviceUUID);
        console.log('Service obtained:', `0x${serviceUUID.toString(16)}`);

        // Get the characteristic for writing data
        const characteristic = await service.getCharacteristic(characteristicUUID);
        console.log('Characteristic obtained:', `0x${characteristicUUID.toString(16)}`);

        // Option 1: Attempt ESC/POS commands
        // If your printer needs ESC/POS, try sending this:
        let encoder = new TextEncoder();
        let data = encoder.encode(escPosCommands);
        await characteristic.writeValue(data);
        console.log("ESC/POS command sent successfully on this characteristic.");

        // Option 2: Also attempt plain text
        // Some printers might accept raw text (less common).
        let dataPlain = encoder.encode(plainText);
        await characteristic.writeValue(dataPlain);
        console.log("Plain text sent successfully on this characteristic.");

        // If we got here with no errors, we can assume success and break out
        return; // Stop trying other combinations
      } catch (error) {
        if (!deviceSelected && error?.name === "NotFoundError") throw error;
        console.warn(`Failed with service=0x${serviceUUID.toString(16)}, characteristic=0x${characteristicUUID.toString(16)}:`, error);
        // Move on to the next combination
      }
    }
  }
  throw new Error("Couldn’t send a test to the selected Bluetooth printer.");
}

export default function PrinterTest() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const supported = Boolean(navigator.bluetooth);

  async function testPrinter() {
    setBusy(true);
    setResult(null);
    try {
      await connectPrinter();
      setResult({ message: "Test sent. Check the printer for output." });
    } catch (error) {
      setResult({ error: true, message: error.name === "NotFoundError" ? "No printer selected." : error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkspacePage title="Bluetooth printer test" description="Send a sample ticket to a nearby Bluetooth printer."
      actions={<Link className="workspace-button" to="/settings?section=printers">Printer settings</Link>}>
      <section className="workspace-section">
        <button className="workspace-button primary" type="button" disabled={!supported || busy} onClick={testPrinter}>
          <FiPrinter aria-hidden="true" /> {busy ? "Testing…" : "Choose and test printer"}
        </button>
        {!supported && <p className="workspace-muted">This browser doesn’t support direct Bluetooth printing. Use the printer routing options in Settings.</p>}
        {result && <p role={result.error ? "alert" : "status"}>{result.message}</p>}
      </section>
    </WorkspacePage>
  );
}
