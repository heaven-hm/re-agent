// Independent implementation recovered from the published LTRData luhn.dll.
// Original behavior includes parity based on UTF-16 string length, not digit count.
using System;
using System.Text;
internal static class LuhnReplica
{
    private const string Usage = "Appends Luhn checksum character to input strings.\r\n\r\nSyntax:\r\nluhn [/PG]\r\n                \r\n/PG      Create PlusGirot counted OCR string with\r\n         both counter and Luhn checksum characters.\r\n         Without this parameter, only Luhn checksum\r\n         character is appended.";
    public static void Main(string[] args)
    {
        bool counted = args.Length > 0;
        if (counted && !string.Equals(args[0], "/PG", StringComparison.OrdinalIgnoreCase))
        { Console.WriteLine(Usage); return; }
        string? line;
        while (!string.IsNullOrEmpty(line = Console.ReadLine()))
        {
            var result = new StringBuilder(line);
            if (counted)
            {
                int count = 0;
                foreach (char c in line) if (char.IsDigit(c)) count++;
                result.Append((count + 2) % 10);
            }
            int sum = 0, factor = (result.Length % 2 == 0) ? 1 : 2;
            foreach (char c in result.ToString())
            {
                if (c < '0' || c > '9') continue;
                int product = (c - '0') * factor;
                sum += product / 10 + product % 10;
                factor = 3 - factor;
            }
            result.Append((char)('0' + (10 - sum % 10) % 10));
            Console.WriteLine(result.ToString());
        }
    }
}
