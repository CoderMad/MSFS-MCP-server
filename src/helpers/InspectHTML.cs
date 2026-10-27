using System;
using System.Threading;
using Microsoft.FlightSimulator.SimConnect;
using System.Runtime.InteropServices;

class Program {
    static SimConnect sc;
    static string result = null;
    static ManualResetEvent done = new ManualResetEvent(false);
    const int WM_USER_SIMCONNECT = 0x0402;

    enum CYCLIC { HTML_REQ }

    static void Main(string[] args) {
        string url = args.Length > 0 ? args[0] : "gc://AS05B_FMC_1?GETALL::current_page=";
        try {
            sc = new SimConnect("msfs-pro-mcp-helper", IntPtr.Zero, WM_USER_SIMCONNECT, null, 0);
            sc.OnRecvOpen += (s, e) => {
                sc.InspectHTML(url);
            };
            sc.OnRecvHTMLData += (s, e) => {
                result = e.jsonResult;
                done.Set();
            };
            sc.OnRecvException += (s, e) => {
                result = "{\"error\":\"SimConnect exception: " + e.dwException + "\"}";
                done.Set();
            };

            // Pump messages for up to 5 seconds
            for (int i = 0; i < 100 && !done.WaitOne(0); i++) {
                sc.ReceiveMessage();
                Thread.Sleep(50);
            }

            if (result != null)
                Console.Write(result);
            else
                Console.Write("{\"error\":\"Timeout waiting for response\"}");

            sc.Dispose();
        } catch (Exception ex) {
            Console.Write("{\"error\":\"" + ex.Message.Replace("\"", "'") + "\"}");
        }
    }
}
