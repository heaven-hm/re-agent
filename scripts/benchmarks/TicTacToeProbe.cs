// Observes the real compiled original or rebuilt assembly; contains no game logic.
using System;
using System.Drawing;
using System.Reflection;
using System.IO;
using System.Windows.Forms;
class TicTacToeProbe
{
    static BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    [STAThread] static void Main(string[] args)
    {
        var assembly=Assembly.LoadFile(Path.GetFullPath(args[0]));
        var type=assembly.GetType("TicTacToe.Form1",true);
        using(var form=(Form)Activator.CreateInstance(type))
        {
            form.Show(); Application.DoEvents();
            var method=type.GetMethod("CheckGameStatus",Private);
            var field=type.GetField("iData",Private);
            var row=(Panel)type.GetField("panel4",Private).GetValue(form);
            var column=(Panel)type.GetField("panel5",Private).GetValue(form);
            for(int board=0;board<19683;board++)
            {
                int value=board; var cells=new int[9];
                for(int i=0;i<9;i++){cells[i]=value%3-1;value/=3;}
                field.SetValue(form,cells);
                row.Visible=false;column.Visible=false;
                int result=(int)method.Invoke(form,null);
                Console.WriteLine(board+":"+result+":"+row.Visible+":"+row.Location.X+","+row.Location.Y+":"+row.BackColor.ToArgb()+":"+column.Visible+":"+column.Location.X+","+column.Location.Y+":"+column.BackColor.ToArgb());
            }
            Directory.CreateDirectory(args[1]);
            type.GetMethod("RestartGame",Private).Invoke(form,null);
            type.GetMethod("playAgainstAFriendToolStripMenuItem_Click",Private).Invoke(form,new object[]{null,EventArgs.Empty});
            Application.DoEvents(); Snapshot(form,Path.Combine(args[1],"initial.png"));
            int[] moves={1,4,2,5,3};
            for(int i=0;i<moves.Length;i++)
            {
                var button=(Button)type.GetField("button"+moves[i],Private).GetValue(form);
                button.PerformClick();Application.DoEvents();
                Snapshot(form,Path.Combine(args[1],"move-"+(i+1)+".png"));
            }
            form.Close();Application.DoEvents();
        }
    }
    static void Snapshot(Form form,string path)
    {
        using(var image=new Bitmap(form.Width,form.Height))
        {form.DrawToBitmap(image,new Rectangle(0,0,form.Width,form.Height));image.Save(path,System.Drawing.Imaging.ImageFormat.Png);}
    }
}
