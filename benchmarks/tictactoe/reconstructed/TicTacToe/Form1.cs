using System;
using System.ComponentModel;
using System.Drawing;
using System.Windows.Forms;
using TicTacToe.Properties;

namespace TicTacToe;

public class Form1 : Form
{
	private int[] iData = new int[9];

	private int iTurn = -1;

	private int iType = 1;

	private bool bEnableBot = false;

	private int iLastMove = -1;

	private int iXScores = 0;

	private int iOScores = 0;

	private IContainer components = null;

	private Panel panel1;

	private ToolStrip toolStrip1;

	private ToolStripDropDownButton toolStripDropDownButton1;

	private ToolStripMenuItem easyToolStripMenuItem;

	private ToolStripMenuItem medateToolStripMenuItem;

	private ToolStripMenuItem hardToolStripMenuItem;

	private ToolStripMenuItem playAgainstAFriendToolStripMenuItem;

	private Button button1;

	private PictureBox pictureBox1;

	private Button button9;

	private Button button8;

	private Button button7;

	private Button button6;

	private Button button5;

	private Button button4;

	private Button button3;

	private Button button2;

	private Label label1;

	private Button button10;

	private Button button11;

	private Panel panel2;

	private Button button12;

	private Panel panel3;

	private Panel panel4;

	private Panel panel5;

	private PictureBox pictureBox2;

	public Form1()
	{
		InitializeComponent();
	}

	private void RestartGame()
	{
		for (int i = 0; i <= 8; i++)
		{
			iData[i] = 0;
		}
		iLastMove = -1;
		bEnableBot = false;
		iTurn = 1;
		SetNextTurn();
		((Control)button1).BackgroundImage = null;
		((Control)button2).BackgroundImage = null;
		((Control)button3).BackgroundImage = null;
		((Control)button4).BackgroundImage = null;
		((Control)button5).BackgroundImage = null;
		((Control)button6).BackgroundImage = null;
		((Control)button7).BackgroundImage = null;
		((Control)button8).BackgroundImage = null;
		((Control)button9).BackgroundImage = null;
		((Control)panel4).Visible = false;
		((Control)panel5).Visible = false;
	}

	private void toolStripDropDownButton1_Click(object sender, EventArgs e)
	{
	}

	private void easyToolStripMenuItem_Click(object sender, EventArgs e)
	{
		((ToolStripItem)toolStripDropDownButton1).Text = "Easy";
		iType = 0;
		RestartGame();
	}

	private void medateToolStripMenuItem_Click(object sender, EventArgs e)
	{
		((ToolStripItem)toolStripDropDownButton1).Text = "Medium";
		iType = 1;
		RestartGame();
	}

	private void hardToolStripMenuItem_Click(object sender, EventArgs e)
	{
		((ToolStripItem)toolStripDropDownButton1).Text = "Impossible";
		iType = 2;
		RestartGame();
	}

	private void playAgainstAFriendToolStripMenuItem_Click(object sender, EventArgs e)
	{
		((ToolStripItem)toolStripDropDownButton1).Text = "Play against a friend";
		iType = 3;
		RestartGame();
	}

	private void button1_Click(object sender, EventArgs e)
	{
		if (iTurn != 0 && !bEnableBot && iData[0] == 0)
		{
			iLastMove = 0;
			iData[0] = iTurn;
			ChangeButtonBackgroundImage(iLastMove);
			SetNextTurn();
			RunBot();
		}
	}

	private void button2_Click(object sender, EventArgs e)
	{
		if (iTurn != 0 && !bEnableBot && iData[1] == 0)
		{
			iLastMove = 1;
			iData[1] = iTurn;
			ChangeButtonBackgroundImage(iLastMove);
			SetNextTurn();
			RunBot();
		}
	}

	private void button3_Click(object sender, EventArgs e)
	{
		if (iTurn != 0 && !bEnableBot && iData[2] == 0)
		{
			iLastMove = 2;
			iData[2] = iTurn;
			ChangeButtonBackgroundImage(iLastMove);
			SetNextTurn();
			RunBot();
		}
	}

	private void button4_Click(object sender, EventArgs e)
	{
		if (iTurn != 0 && !bEnableBot && iData[3] == 0)
		{
			iLastMove = 3;
			iData[3] = iTurn;
			ChangeButtonBackgroundImage(iLastMove);
			SetNextTurn();
			RunBot();
		}
	}

	private void button5_Click(object sender, EventArgs e)
	{
		if (iTurn != 0 && !bEnableBot && iData[4] == 0)
		{
			iLastMove = 4;
			iData[4] = iTurn;
			ChangeButtonBackgroundImage(iLastMove);
			SetNextTurn();
			RunBot();
		}
	}

	private void button6_Click(object sender, EventArgs e)
	{
		if (iTurn != 0 && !bEnableBot && iData[5] == 0)
		{
			iLastMove = 5;
			iData[5] = iTurn;
			ChangeButtonBackgroundImage(iLastMove);
			SetNextTurn();
			RunBot();
		}
	}

	private void button7_Click(object sender, EventArgs e)
	{
		if (iTurn != 0 && !bEnableBot && iData[6] == 0)
		{
			iLastMove = 6;
			iData[6] = iTurn;
			ChangeButtonBackgroundImage(iLastMove);
			SetNextTurn();
			RunBot();
		}
	}

	private void button8_Click(object sender, EventArgs e)
	{
		if (iTurn != 0 && !bEnableBot && iData[7] == 0)
		{
			iLastMove = 7;
			iData[7] = iTurn;
			ChangeButtonBackgroundImage(iLastMove);
			SetNextTurn();
			RunBot();
		}
	}

	private void button9_Click(object sender, EventArgs e)
	{
		if (iTurn != 0 && !bEnableBot && iData[8] == 0)
		{
			iLastMove = 8;
			iData[8] = iTurn;
			ChangeButtonBackgroundImage(iLastMove);
			SetNextTurn();
			RunBot();
		}
	}

	private void button10_Click(object sender, EventArgs e)
	{
		RestartGame();
	}

	private void button11_Click(object sender, EventArgs e)
	{
	}

	private void panel2_Paint(object sender, PaintEventArgs e)
	{
	}

	private void button12_Click(object sender, EventArgs e)
	{
		if (iType != 3 && iLastMove == -1)
		{
			RunBot();
		}
	}

	private void panel3_Paint(object sender, PaintEventArgs e)
	{
	}

	private void SetNextTurn()
	{
		switch (CheckGameStatus())
		{
		case 2:
			if (iTurn == -1)
			{
				iTurn = 1;
				((Control)label1).Text = "                 \ud802\ude52 Turn";
				((Control)panel2).Visible = false;
				((Control)panel3).Visible = true;
			}
			else if (iType != 3 && iLastMove == -1)
			{
				iTurn = -1;
				((Control)label1).Text = "Start game or select player";
				((Control)panel2).Visible = true;
				((Control)panel3).Visible = false;
			}
			else
			{
				iTurn = -1;
				((Control)label1).Text = "                 \ud83d\uddd9 Turn";
				((Control)panel2).Visible = true;
				((Control)panel3).Visible = false;
			}
			return;
		case -1:
			iXScores++;
			((Control)button11).Text = "\ud83d\uddd9                   " + iXScores;
			break;
		case 1:
			iOScores++;
			((Control)button12).Text = "◯                   " + iOScores;
			break;
		}
		iTurn = 0;
		((Control)label1).Text = "              Game Over";
	}

	private int CheckGameStatus()
	{
		if (iData[0] != 0 && iData[0] == iData[1] && iData[1] == iData[2])
		{
			((Control)panel4).Location = new Point(202, 49);
			if (iData[0] == -1)
			{
				((Control)panel4).BackColor = Color.Black;
			}
			else
			{
				((Control)panel4).BackColor = Color.White;
			}
			((Control)panel4).Visible = true;
			return iData[0];
		}
		if (iData[3] != 0 && iData[3] == iData[4] && iData[4] == iData[5])
		{
			((Control)panel4).Location = new Point(202, 114);
			if (iData[3] == -1)
			{
				((Control)panel4).BackColor = Color.Black;
			}
			else
			{
				((Control)panel4).BackColor = Color.White;
			}
			((Control)panel4).Visible = true;
			return iData[3];
		}
		if (iData[6] != 0 && iData[6] == iData[7] && iData[7] == iData[8])
		{
			((Control)panel4).Location = new Point(202, 178);
			if (iData[6] == -1)
			{
				((Control)panel4).BackColor = Color.Black;
			}
			else
			{
				((Control)panel4).BackColor = Color.White;
			}
			((Control)panel4).Visible = true;
			return iData[6];
		}
		if (iData[0] != 0 && iData[0] == iData[3] && iData[3] == iData[6])
		{
			((Control)panel5).Location = new Point(247, 5);
			if (iData[0] == -1)
			{
				((Control)panel5).BackColor = Color.Black;
			}
			else
			{
				((Control)panel5).BackColor = Color.White;
			}
			((Control)panel5).Visible = true;
			return iData[0];
		}
		if (iData[1] != 0 && iData[1] == iData[4] && iData[4] == iData[7])
		{
			((Control)panel5).Location = new Point(311, 5);
			if (iData[1] == -1)
			{
				((Control)panel5).BackColor = Color.Black;
			}
			else
			{
				((Control)panel5).BackColor = Color.White;
			}
			((Control)panel5).Visible = true;
			return iData[1];
		}
		if (iData[2] != 0 && iData[2] == iData[5] && iData[5] == iData[8])
		{
			((Control)panel5).Location = new Point(378, 5);
			if (iData[2] == -1)
			{
				((Control)panel5).BackColor = Color.Black;
			}
			else
			{
				((Control)panel5).BackColor = Color.White;
			}
			((Control)panel5).Visible = true;
			return iData[2];
		}
		if (iData[0] != 0 && iData[0] == iData[4] && iData[4] == iData[8])
		{
			return iData[0];
		}
		if (iData[2] != 0 && iData[2] == iData[4] && iData[4] == iData[6])
		{
			return iData[2];
		}
		if (iData[0] != 0 && iData[1] != 0 && iData[2] != 0 && iData[3] != 0 && iData[4] != 0 && iData[5] != 0 && iData[6] != 0 && iData[7] != 0 && iData[8] != 0)
		{
			return 0;
		}
		return 2;
	}

	private void RunBot()
	{
		if (iType != 3 && iTurn != 0)
		{
			bEnableBot = true;
			WaitNSeconds(1);
			if (iType == 0)
			{
				RunEasyBot();
			}
			else if (iType == 1)
			{
				RunMediumBot();
			}
			else if (iType == 2)
			{
				RunImpossibleBot();
			}
		}
	}

	private void RunEasyBot()
	{
		iLastMove = RandomPosition();
		iData[iLastMove] = iTurn;
		ChangeButtonBackgroundImage(iLastMove);
		bEnableBot = false;
		SetNextTurn();
	}

	private void RunMediumBot()
	{
		int turn = ((iTurn == -1) ? 1 : (-1));
		if (iLastMove == -1)
		{
			iLastMove = RandomPosition();
		}
		else
		{
			CheckWinAndDontLose(turn);
			CheckWinAndDontLose(iTurn);
			if (iData[iLastMove] != 0)
			{
				iLastMove = RandomPosition();
			}
		}
		iData[iLastMove] = iTurn;
		ChangeButtonBackgroundImage(iLastMove);
		bEnableBot = false;
		SetNextTurn();
	}

	private void RunImpossibleBot()
	{
		int num = ((iTurn == -1) ? 1 : (-1));
		if (iLastMove == -1)
		{
			if (iData[4] == 0)
			{
				iLastMove = 4;
			}
		}
		else if (iData[iLastMove] != 0)
		{
			CheckWinAndDontLose(num);
			CheckWinAndDontLose(iTurn);
			if (iData[iLastMove] != 0)
			{
				if (iLastMove == 4)
				{
					if (iData[0] == 0)
					{
						iLastMove = 0;
					}
					else if (iData[2] == 0)
					{
						iLastMove = 2;
					}
					else if (iData[6] == 0)
					{
						iLastMove = 6;
					}
					else if (iData[8] == 0)
					{
						iLastMove = 8;
					}
					else
					{
						iLastMove = RandomPosition();
					}
				}
				else if (iLastMove == 0 || iLastMove == 2 || iLastMove == 6 || iLastMove == 8)
				{
					if (iData[4] == 0)
					{
						iLastMove = 4;
					}
					else if (iData[0] == 0 && iData[8] == num)
					{
						iLastMove = 0;
					}
					else if (iData[2] == 0 && iData[6] == num)
					{
						iLastMove = 2;
					}
					else if (iData[6] == 0 && iData[2] == num)
					{
						iLastMove = 6;
					}
					else if (iData[8] == 0 && iData[0] == num)
					{
						iLastMove = 8;
					}
					else if ((iData[0] == num && iData[8] == num) || (iData[2] == num && iData[6] == num))
					{
						if (iData[1] == 0)
						{
							iLastMove = 1;
						}
						else if (iData[3] == 0)
						{
							iLastMove = 3;
						}
						else if (iData[5] == 0)
						{
							iLastMove = 5;
						}
						else if (iData[7] == 0)
						{
							iLastMove = 7;
						}
					}
					else if (iData[0] == 0)
					{
						iLastMove = 0;
					}
					else if (iData[2] == 0)
					{
						iLastMove = 2;
					}
					else if (iData[6] == 0)
					{
						iLastMove = 6;
					}
					else if (iData[8] == 0)
					{
						iLastMove = 8;
					}
					else
					{
						iLastMove = RandomPosition();
					}
				}
				else if (iLastMove == 1 || iLastMove == 3 || iLastMove == 5 || iLastMove == 7)
				{
					if (iData[4] == 0)
					{
						iLastMove = 4;
					}
					else if (iData[0] == 0 && iData[1] == num && iData[3] == num)
					{
						iLastMove = 0;
					}
					else if (iData[2] == 0 && iData[1] == num && iData[5] == num)
					{
						iLastMove = 2;
					}
					else if (iData[6] == 0 && iData[3] == num && iData[7] == num)
					{
						iLastMove = 6;
					}
					else if (iData[8] == 0 && iData[5] == num && iData[7] == num)
					{
						iLastMove = 8;
					}
					else if (iData[0] == 0 && (iData[1] == num || iData[3] == num))
					{
						iLastMove = 0;
					}
					else if (iData[2] == 0 && (iData[1] == num || iData[5] == num))
					{
						iLastMove = 2;
					}
					else if (iData[6] == 0 && (iData[3] == num || iData[7] == num))
					{
						iLastMove = 6;
					}
					else if (iData[8] == 0 && (iData[5] == num || iData[7] == num))
					{
						iLastMove = 8;
					}
					else if (iData[0] == 0)
					{
						iLastMove = 0;
					}
					else if (iData[2] == 0)
					{
						iLastMove = 2;
					}
					else if (iData[6] == 0)
					{
						iLastMove = 6;
					}
					else if (iData[8] == 0)
					{
						iLastMove = 8;
					}
					else if (iData[1] == 0)
					{
						iLastMove = 1;
					}
					else if (iData[3] == 0)
					{
						iLastMove = 3;
					}
					else if (iData[5] == 0)
					{
						iLastMove = 5;
					}
					else if (iData[7] == 0)
					{
						iLastMove = 7;
					}
					else
					{
						iLastMove = RandomPosition();
					}
				}
			}
		}
		iData[iLastMove] = iTurn;
		ChangeButtonBackgroundImage(iLastMove);
		bEnableBot = false;
		SetNextTurn();
	}

	private void CheckWinAndDontLose(int turn)
	{
		if (iData[0] == 0 && ((iData[1] == turn && iData[2] == turn) || (iData[3] == turn && iData[6] == turn) || (iData[4] == turn && iData[8] == turn)))
		{
			iLastMove = 0;
		}
		else if (iData[1] == 0 && ((iData[0] == turn && iData[2] == turn) || (iData[4] == turn && iData[7] == turn)))
		{
			iLastMove = 1;
		}
		else if (iData[2] == 0 && ((iData[0] == turn && iData[1] == turn) || (iData[5] == turn && iData[8] == turn) || (iData[4] == turn && iData[6] == turn)))
		{
			iLastMove = 2;
		}
		else if (iData[3] == 0 && ((iData[0] == turn && iData[6] == turn) || (iData[4] == turn && iData[5] == turn)))
		{
			iLastMove = 3;
		}
		else if (iData[4] == 0 && ((iData[0] == turn && iData[8] == turn) || (iData[2] == turn && iData[6] == turn) || (iData[1] == turn && iData[7] == turn) || (iData[3] == turn && iData[5] == turn)))
		{
			iLastMove = 4;
		}
		else if (iData[5] == 0 && ((iData[2] == turn && iData[8] == turn) || (iData[3] == turn && iData[4] == turn)))
		{
			iLastMove = 5;
		}
		else if (iData[6] == 0 && ((iData[0] == turn && iData[3] == turn) || (iData[7] == turn && iData[8] == turn) || (iData[2] == turn && iData[4] == turn)))
		{
			iLastMove = 6;
		}
		else if (iData[7] == 0 && ((iData[1] == turn && iData[4] == turn) || (iData[6] == turn && iData[8] == turn)))
		{
			iLastMove = 7;
		}
		else if (iData[8] == 0 && ((iData[2] == turn && iData[5] == turn) || (iData[6] == turn && iData[7] == turn) || (iData[0] == turn && iData[4] == turn)))
		{
			iLastMove = 8;
		}
	}

	private int RandomPosition()
	{
		int num = 0;
		for (int i = 0; i <= 8; i++)
		{
			if (iData[i] == 0)
			{
				num++;
			}
		}
		Random random = new Random();
		int num2 = random.Next(1, num);
		num = 0;
		for (int j = 0; j <= 8; j++)
		{
			if (iData[j] == 0)
			{
				num++;
				if (num == num2)
				{
					return j;
				}
			}
		}
		return -1;
	}

	private void ChangeButtonBackgroundImage(int iPosition)
	{
		if (iData[iPosition] == -1)
		{
			switch (iPosition)
			{
			case 0:
				((Control)button1).BackgroundImage = (Image)(object)Resources.Cross;
				break;
			case 1:
				((Control)button2).BackgroundImage = (Image)(object)Resources.Cross;
				break;
			case 2:
				((Control)button3).BackgroundImage = (Image)(object)Resources.Cross;
				break;
			case 3:
				((Control)button4).BackgroundImage = (Image)(object)Resources.Cross;
				break;
			case 4:
				((Control)button5).BackgroundImage = (Image)(object)Resources.Cross;
				break;
			case 5:
				((Control)button6).BackgroundImage = (Image)(object)Resources.Cross;
				break;
			case 6:
				((Control)button7).BackgroundImage = (Image)(object)Resources.Cross;
				break;
			case 7:
				((Control)button8).BackgroundImage = (Image)(object)Resources.Cross;
				break;
			case 8:
				((Control)button9).BackgroundImage = (Image)(object)Resources.Cross;
				break;
			}
		}
		else if (iData[iPosition] == 1)
		{
			switch (iPosition)
			{
			case 0:
				((Control)button1).BackgroundImage = (Image)(object)Resources.Circle;
				break;
			case 1:
				((Control)button2).BackgroundImage = (Image)(object)Resources.Circle;
				break;
			case 2:
				((Control)button3).BackgroundImage = (Image)(object)Resources.Circle;
				break;
			case 3:
				((Control)button4).BackgroundImage = (Image)(object)Resources.Circle;
				break;
			case 4:
				((Control)button5).BackgroundImage = (Image)(object)Resources.Circle;
				break;
			case 5:
				((Control)button6).BackgroundImage = (Image)(object)Resources.Circle;
				break;
			case 6:
				((Control)button7).BackgroundImage = (Image)(object)Resources.Circle;
				break;
			case 7:
				((Control)button8).BackgroundImage = (Image)(object)Resources.Circle;
				break;
			case 8:
				((Control)button9).BackgroundImage = (Image)(object)Resources.Circle;
				break;
			}
		}
		else
		{
			switch (iPosition)
			{
			case 0:
				((Control)button1).BackgroundImage = null;
				break;
			case 1:
				((Control)button2).BackgroundImage = null;
				break;
			case 2:
				((Control)button3).BackgroundImage = null;
				break;
			case 3:
				((Control)button4).BackgroundImage = null;
				break;
			case 4:
				((Control)button5).BackgroundImage = null;
				break;
			case 5:
				((Control)button6).BackgroundImage = null;
				break;
			case 6:
				((Control)button7).BackgroundImage = null;
				break;
			case 7:
				((Control)button8).BackgroundImage = null;
				break;
			case 8:
				((Control)button9).BackgroundImage = null;
				break;
			}
		}
	}

	private void WaitNSeconds(int segundos)
	{
		if (segundos >= 1)
		{
			DateTime dateTime = DateTime.Now.AddSeconds(segundos);
			while (DateTime.Now < dateTime)
			{
				Application.DoEvents();
			}
		}
	}

	private void Form1_Load(object sender, EventArgs e)
	{
	}

	protected override void Dispose(bool disposing)
	{
		if (disposing && components != null)
		{
			components.Dispose();
		}
		base.Dispose(disposing);
	}

	private void InitializeComponent()
	{
		//IL_0012: Unknown result type (might be due to invalid IL or missing references)
		//IL_001c: Expected O, but got Unknown
		//IL_001d: Unknown result type (might be due to invalid IL or missing references)
		//IL_0027: Expected O, but got Unknown
		//IL_0028: Unknown result type (might be due to invalid IL or missing references)
		//IL_0032: Expected O, but got Unknown
		//IL_0033: Unknown result type (might be due to invalid IL or missing references)
		//IL_003d: Expected O, but got Unknown
		//IL_003e: Unknown result type (might be due to invalid IL or missing references)
		//IL_0048: Expected O, but got Unknown
		//IL_0049: Unknown result type (might be due to invalid IL or missing references)
		//IL_0053: Expected O, but got Unknown
		//IL_0054: Unknown result type (might be due to invalid IL or missing references)
		//IL_005e: Expected O, but got Unknown
		//IL_005f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0069: Expected O, but got Unknown
		//IL_006a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0074: Expected O, but got Unknown
		//IL_0075: Unknown result type (might be due to invalid IL or missing references)
		//IL_007f: Expected O, but got Unknown
		//IL_0080: Unknown result type (might be due to invalid IL or missing references)
		//IL_008a: Expected O, but got Unknown
		//IL_008b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0095: Expected O, but got Unknown
		//IL_0096: Unknown result type (might be due to invalid IL or missing references)
		//IL_00a0: Expected O, but got Unknown
		//IL_00a1: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ab: Expected O, but got Unknown
		//IL_00ac: Unknown result type (might be due to invalid IL or missing references)
		//IL_00b6: Expected O, but got Unknown
		//IL_00b7: Unknown result type (might be due to invalid IL or missing references)
		//IL_00c1: Expected O, but got Unknown
		//IL_00c2: Unknown result type (might be due to invalid IL or missing references)
		//IL_00cc: Expected O, but got Unknown
		//IL_00cd: Unknown result type (might be due to invalid IL or missing references)
		//IL_00d7: Expected O, but got Unknown
		//IL_00d8: Unknown result type (might be due to invalid IL or missing references)
		//IL_00e2: Expected O, but got Unknown
		//IL_00e3: Unknown result type (might be due to invalid IL or missing references)
		//IL_00ed: Expected O, but got Unknown
		//IL_00ee: Unknown result type (might be due to invalid IL or missing references)
		//IL_00f8: Expected O, but got Unknown
		//IL_00f9: Unknown result type (might be due to invalid IL or missing references)
		//IL_0103: Expected O, but got Unknown
		//IL_0104: Unknown result type (might be due to invalid IL or missing references)
		//IL_010e: Expected O, but got Unknown
		//IL_010f: Unknown result type (might be due to invalid IL or missing references)
		//IL_0119: Expected O, but got Unknown
		//IL_011a: Unknown result type (might be due to invalid IL or missing references)
		//IL_0124: Expected O, but got Unknown
		//IL_0125: Unknown result type (might be due to invalid IL or missing references)
		//IL_012f: Expected O, but got Unknown
		//IL_0f7b: Unknown result type (might be due to invalid IL or missing references)
		//IL_0f85: Expected O, but got Unknown
		//IL_114e: Unknown result type (might be due to invalid IL or missing references)
		//IL_1158: Expected O, but got Unknown
		//IL_1278: Unknown result type (might be due to invalid IL or missing references)
		//IL_1282: Expected O, but got Unknown
		//IL_13b9: Unknown result type (might be due to invalid IL or missing references)
		//IL_13c3: Expected O, but got Unknown
		//IL_14cf: Unknown result type (might be due to invalid IL or missing references)
		//IL_14d9: Expected O, but got Unknown
		//IL_157b: Unknown result type (might be due to invalid IL or missing references)
		//IL_1585: Expected O, but got Unknown
		//IL_16a4: Unknown result type (might be due to invalid IL or missing references)
		//IL_16ae: Expected O, but got Unknown
		//IL_178b: Unknown result type (might be due to invalid IL or missing references)
		//IL_1795: Expected O, but got Unknown
		ComponentResourceManager componentResourceManager = new ComponentResourceManager(typeof(Form1));
		panel1 = new Panel();
		pictureBox2 = new PictureBox();
		panel5 = new Panel();
		panel4 = new Panel();
		button9 = new Button();
		button8 = new Button();
		button7 = new Button();
		button6 = new Button();
		button5 = new Button();
		button4 = new Button();
		button3 = new Button();
		button2 = new Button();
		button1 = new Button();
		pictureBox1 = new PictureBox();
		toolStrip1 = new ToolStrip();
		toolStripDropDownButton1 = new ToolStripDropDownButton();
		easyToolStripMenuItem = new ToolStripMenuItem();
		medateToolStripMenuItem = new ToolStripMenuItem();
		hardToolStripMenuItem = new ToolStripMenuItem();
		playAgainstAFriendToolStripMenuItem = new ToolStripMenuItem();
		label1 = new Label();
		button10 = new Button();
		button11 = new Button();
		panel2 = new Panel();
		button12 = new Button();
		panel3 = new Panel();
		((Control)panel1).SuspendLayout();
		((ISupportInitialize)pictureBox2).BeginInit();
		((ISupportInitialize)pictureBox1).BeginInit();
		((Control)toolStrip1).SuspendLayout();
		((Control)this).SuspendLayout();
		((Control)panel1).BackColor = Color.Khaki;
		((Control)panel1).Controls.Add((Control)(object)pictureBox2);
		((Control)panel1).Controls.Add((Control)(object)panel5);
		((Control)panel1).Controls.Add((Control)(object)panel4);
		((Control)panel1).Controls.Add((Control)(object)button9);
		((Control)panel1).Controls.Add((Control)(object)button8);
		((Control)panel1).Controls.Add((Control)(object)button7);
		((Control)panel1).Controls.Add((Control)(object)button6);
		((Control)panel1).Controls.Add((Control)(object)button5);
		((Control)panel1).Controls.Add((Control)(object)button4);
		((Control)panel1).Controls.Add((Control)(object)button3);
		((Control)panel1).Controls.Add((Control)(object)button2);
		((Control)panel1).Controls.Add((Control)(object)button1);
		((Control)panel1).Controls.Add((Control)(object)pictureBox1);
		((Control)panel1).Location = new Point(0, 128);
		((Control)panel1).Name = "panel1";
		((Control)panel1).Size = new Size(634, 237);
		((Control)panel1).TabIndex = 2;
		((Control)pictureBox2).BackColor = Color.Transparent;
		((Control)pictureBox2).BackgroundImage = (Image)(object)Resources.Line1;
		((Control)pictureBox2).BackgroundImageLayout = (ImageLayout)4;
		((Control)pictureBox2).Location = new Point(411, 18);
		((Control)pictureBox2).Name = "pictureBox2";
		((Control)pictureBox2).Size = new Size(200, 200);
		pictureBox2.TabIndex = 12;
		pictureBox2.TabStop = false;
		((Control)pictureBox2).Visible = false;
		((Control)panel5).BackColor = SystemColors.WindowText;
		((Control)panel5).Location = new Point(378, 5);
		((Control)panel5).Name = "panel5";
		((Control)panel5).Size = new Size(10, 228);
		((Control)panel5).TabIndex = 11;
		((Control)panel5).Visible = false;
		((Control)panel4).BackColor = SystemColors.WindowText;
		((Control)panel4).Location = new Point(202, 178);
		((Control)panel4).Name = "panel4";
		((Control)panel4).Size = new Size(227, 10);
		((Control)panel4).TabIndex = 10;
		((Control)panel4).Visible = false;
		((Control)button9).BackColor = Color.Khaki;
		((Control)button9).BackgroundImageLayout = (ImageLayout)4;
		((Control)button9).Cursor = Cursors.Default;
		((ButtonBase)button9).FlatAppearance.BorderColor = Color.Khaki;
		((ButtonBase)button9).FlatAppearance.BorderSize = 0;
		((ButtonBase)button9).FlatAppearance.MouseDownBackColor = Color.Khaki;
		((ButtonBase)button9).FlatAppearance.MouseOverBackColor = Color.Khaki;
		((ButtonBase)button9).FlatStyle = (FlatStyle)0;
		((Control)button9).ForeColor = Color.Indigo;
		((Control)button9).Location = new Point(360, 160);
		((Control)button9).Name = "button9";
		((Control)button9).Size = new Size(45, 45);
		((Control)button9).TabIndex = 9;
		((ButtonBase)button9).UseVisualStyleBackColor = false;
		((Control)button9).Click += button9_Click;
		((Control)button8).BackColor = Color.Khaki;
		((Control)button8).BackgroundImageLayout = (ImageLayout)4;
		((Control)button8).Cursor = Cursors.Default;
		((ButtonBase)button8).FlatAppearance.BorderColor = Color.Khaki;
		((ButtonBase)button8).FlatAppearance.BorderSize = 0;
		((ButtonBase)button8).FlatAppearance.MouseDownBackColor = Color.Khaki;
		((ButtonBase)button8).FlatAppearance.MouseOverBackColor = Color.Khaki;
		((ButtonBase)button8).FlatStyle = (FlatStyle)0;
		((Control)button8).ForeColor = Color.Indigo;
		((Control)button8).Location = new Point(294, 160);
		((Control)button8).Name = "button8";
		((Control)button8).Size = new Size(45, 45);
		((Control)button8).TabIndex = 8;
		((ButtonBase)button8).UseVisualStyleBackColor = false;
		((Control)button8).Click += button8_Click;
		((Control)button7).BackColor = Color.Khaki;
		((Control)button7).BackgroundImageLayout = (ImageLayout)4;
		((Control)button7).Cursor = Cursors.Default;
		((ButtonBase)button7).FlatAppearance.BorderColor = Color.Khaki;
		((ButtonBase)button7).FlatAppearance.BorderSize = 0;
		((ButtonBase)button7).FlatAppearance.MouseDownBackColor = Color.Khaki;
		((ButtonBase)button7).FlatAppearance.MouseOverBackColor = Color.Khaki;
		((ButtonBase)button7).FlatStyle = (FlatStyle)0;
		((Control)button7).ForeColor = Color.Indigo;
		((Control)button7).Location = new Point(229, 160);
		((Control)button7).Name = "button7";
		((Control)button7).Size = new Size(45, 45);
		((Control)button7).TabIndex = 7;
		((ButtonBase)button7).UseVisualStyleBackColor = false;
		((Control)button7).Click += button7_Click;
		((Control)button6).BackColor = Color.Khaki;
		((Control)button6).BackgroundImageLayout = (ImageLayout)4;
		((Control)button6).Cursor = Cursors.Default;
		((ButtonBase)button6).FlatAppearance.BorderColor = Color.Khaki;
		((ButtonBase)button6).FlatAppearance.BorderSize = 0;
		((ButtonBase)button6).FlatAppearance.MouseDownBackColor = Color.Khaki;
		((ButtonBase)button6).FlatAppearance.MouseOverBackColor = Color.Khaki;
		((ButtonBase)button6).FlatStyle = (FlatStyle)0;
		((Control)button6).ForeColor = Color.Indigo;
		((Control)button6).Location = new Point(360, 96);
		((Control)button6).Name = "button6";
		((Control)button6).Size = new Size(45, 45);
		((Control)button6).TabIndex = 6;
		((ButtonBase)button6).UseVisualStyleBackColor = false;
		((Control)button6).Click += button6_Click;
		((Control)button5).BackColor = Color.Khaki;
		((Control)button5).BackgroundImageLayout = (ImageLayout)4;
		((Control)button5).Cursor = Cursors.Default;
		((ButtonBase)button5).FlatAppearance.BorderColor = Color.Khaki;
		((ButtonBase)button5).FlatAppearance.BorderSize = 0;
		((ButtonBase)button5).FlatAppearance.MouseDownBackColor = Color.Khaki;
		((ButtonBase)button5).FlatAppearance.MouseOverBackColor = Color.Khaki;
		((ButtonBase)button5).FlatStyle = (FlatStyle)0;
		((Control)button5).ForeColor = Color.Indigo;
		((Control)button5).Location = new Point(294, 96);
		((Control)button5).Name = "button5";
		((Control)button5).Size = new Size(45, 45);
		((Control)button5).TabIndex = 5;
		((ButtonBase)button5).UseVisualStyleBackColor = false;
		((Control)button5).Click += button5_Click;
		((Control)button4).BackColor = Color.Khaki;
		((Control)button4).BackgroundImageLayout = (ImageLayout)4;
		((Control)button4).Cursor = Cursors.Default;
		((ButtonBase)button4).FlatAppearance.BorderColor = Color.Khaki;
		((ButtonBase)button4).FlatAppearance.BorderSize = 0;
		((ButtonBase)button4).FlatAppearance.MouseDownBackColor = Color.Khaki;
		((ButtonBase)button4).FlatAppearance.MouseOverBackColor = Color.Khaki;
		((ButtonBase)button4).FlatStyle = (FlatStyle)0;
		((Control)button4).ForeColor = Color.Indigo;
		((Control)button4).Location = new Point(229, 96);
		((Control)button4).Name = "button4";
		((Control)button4).Size = new Size(45, 45);
		((Control)button4).TabIndex = 4;
		((ButtonBase)button4).UseVisualStyleBackColor = false;
		((Control)button4).Click += button4_Click;
		((Control)button3).BackColor = Color.Khaki;
		((Control)button3).BackgroundImageLayout = (ImageLayout)4;
		((Control)button3).Cursor = Cursors.Default;
		((ButtonBase)button3).FlatAppearance.BorderColor = Color.Khaki;
		((ButtonBase)button3).FlatAppearance.BorderSize = 0;
		((ButtonBase)button3).FlatAppearance.MouseDownBackColor = Color.Khaki;
		((ButtonBase)button3).FlatAppearance.MouseOverBackColor = Color.Khaki;
		((ButtonBase)button3).FlatStyle = (FlatStyle)0;
		((Control)button3).ForeColor = Color.Indigo;
		((Control)button3).Location = new Point(361, 30);
		((Control)button3).Name = "button3";
		((Control)button3).Size = new Size(45, 45);
		((Control)button3).TabIndex = 3;
		((ButtonBase)button3).UseVisualStyleBackColor = false;
		((Control)button3).Click += button3_Click;
		((Control)button2).BackColor = Color.Khaki;
		((Control)button2).BackgroundImageLayout = (ImageLayout)4;
		((Control)button2).Cursor = Cursors.Default;
		((ButtonBase)button2).FlatAppearance.BorderColor = Color.Khaki;
		((ButtonBase)button2).FlatAppearance.BorderSize = 0;
		((ButtonBase)button2).FlatAppearance.MouseDownBackColor = Color.Khaki;
		((ButtonBase)button2).FlatAppearance.MouseOverBackColor = Color.Khaki;
		((ButtonBase)button2).FlatStyle = (FlatStyle)0;
		((Control)button2).ForeColor = Color.Indigo;
		((Control)button2).Location = new Point(294, 30);
		((Control)button2).Name = "button2";
		((Control)button2).Size = new Size(45, 45);
		((Control)button2).TabIndex = 2;
		((ButtonBase)button2).UseVisualStyleBackColor = false;
		((Control)button2).Click += button2_Click;
		((Control)button1).BackColor = Color.Khaki;
		((Control)button1).BackgroundImageLayout = (ImageLayout)4;
		((Control)button1).Cursor = Cursors.Default;
		((ButtonBase)button1).FlatAppearance.BorderColor = Color.Khaki;
		((ButtonBase)button1).FlatAppearance.BorderSize = 0;
		((ButtonBase)button1).FlatAppearance.MouseDownBackColor = Color.Khaki;
		((ButtonBase)button1).FlatAppearance.MouseOverBackColor = Color.Khaki;
		((ButtonBase)button1).FlatStyle = (FlatStyle)0;
		((Control)button1).ForeColor = Color.Indigo;
		((Control)button1).Location = new Point(229, 30);
		((Control)button1).Name = "button1";
		((Control)button1).Size = new Size(45, 45);
		((Control)button1).TabIndex = 0;
		((ButtonBase)button1).UseVisualStyleBackColor = false;
		((Control)button1).Click += button1_Click;
		((Control)pictureBox1).BackColor = Color.Khaki;
		((Control)pictureBox1).BackgroundImage = (Image)(object)Resources.Vector2;
		((Control)pictureBox1).BackgroundImageLayout = (ImageLayout)4;
		((Control)pictureBox1).Location = new Point(216, 18);
		((Control)pictureBox1).Name = "pictureBox1";
		((Control)pictureBox1).Size = new Size(200, 200);
		pictureBox1.TabIndex = 1;
		pictureBox1.TabStop = false;
		toolStrip1.GripStyle = (ToolStripGripStyle)0;
		toolStrip1.Items.AddRange((ToolStripItem[])(object)new ToolStripItem[1] { (ToolStripItem)toolStripDropDownButton1 });
		((Control)toolStrip1).Location = new Point(0, 0);
		((Control)toolStrip1).Name = "toolStrip1";
		((Control)toolStrip1).Size = new Size(635, 25);
		((Control)toolStrip1).TabIndex = 3;
		((Control)toolStrip1).Text = "toolStrip1";
		((ToolStripItem)toolStripDropDownButton1).DisplayStyle = (ToolStripItemDisplayStyle)1;
		((ToolStripDropDownItem)toolStripDropDownButton1).DropDownItems.AddRange((ToolStripItem[])(object)new ToolStripItem[4]
		{
			(ToolStripItem)easyToolStripMenuItem,
			(ToolStripItem)medateToolStripMenuItem,
			(ToolStripItem)hardToolStripMenuItem,
			(ToolStripItem)playAgainstAFriendToolStripMenuItem
		});
		((ToolStripItem)toolStripDropDownButton1).Font = new Font("Arial", 9f, (FontStyle)0, (GraphicsUnit)3, (byte)0);
		((ToolStripItem)toolStripDropDownButton1).ImageTransparentColor = Color.Magenta;
		((ToolStripItem)toolStripDropDownButton1).Name = "toolStripDropDownButton1";
		((ToolStripItem)toolStripDropDownButton1).Size = new Size(64, 22);
		((ToolStripItem)toolStripDropDownButton1).Text = "Medium";
		((ToolStripItem)toolStripDropDownButton1).Click += toolStripDropDownButton1_Click;
		((ToolStripItem)easyToolStripMenuItem).Name = "easyToolStripMenuItem";
		((ToolStripItem)easyToolStripMenuItem).Size = new Size(185, 22);
		((ToolStripItem)easyToolStripMenuItem).Text = "Easy";
		((ToolStripItem)easyToolStripMenuItem).Click += easyToolStripMenuItem_Click;
		((ToolStripItem)medateToolStripMenuItem).Name = "medateToolStripMenuItem";
		((ToolStripItem)medateToolStripMenuItem).Size = new Size(185, 22);
		((ToolStripItem)medateToolStripMenuItem).Text = "Medium";
		((ToolStripItem)medateToolStripMenuItem).Click += medateToolStripMenuItem_Click;
		((ToolStripItem)hardToolStripMenuItem).Name = "hardToolStripMenuItem";
		((ToolStripItem)hardToolStripMenuItem).Size = new Size(185, 22);
		((ToolStripItem)hardToolStripMenuItem).Text = "Impossible";
		((ToolStripItem)hardToolStripMenuItem).Click += hardToolStripMenuItem_Click;
		((ToolStripItem)playAgainstAFriendToolStripMenuItem).Name = "playAgainstAFriendToolStripMenuItem";
		((ToolStripItem)playAgainstAFriendToolStripMenuItem).Size = new Size(185, 22);
		((ToolStripItem)playAgainstAFriendToolStripMenuItem).Text = "Play against a friend";
		((ToolStripItem)playAgainstAFriendToolStripMenuItem).Click += playAgainstAFriendToolStripMenuItem_Click;
		((Control)label1).AutoSize = true;
		((Control)label1).Font = new Font("Arial Unicode MS", 9f, (FontStyle)0, (GraphicsUnit)3, (byte)0);
		((Control)label1).ForeColor = SystemColors.ControlDarkDark;
		((Control)label1).Location = new Point(240, 101);
		((Control)label1).Name = "label1";
		((Control)label1).Size = new Size(154, 16);
		((Control)label1).TabIndex = 4;
		((Control)label1).Text = "Start game or select player";
		label1.TextAlign = (ContentAlignment)32;
		((Control)button10).BackColor = SystemColors.Control;
		((Control)button10).BackgroundImageLayout = (ImageLayout)4;
		((Control)button10).Cursor = Cursors.Hand;
		((ButtonBase)button10).FlatAppearance.BorderColor = SystemColors.ButtonFace;
		((ButtonBase)button10).FlatAppearance.BorderSize = 0;
		((ButtonBase)button10).FlatAppearance.MouseDownBackColor = SystemColors.ButtonFace;
		((ButtonBase)button10).FlatAppearance.MouseOverBackColor = SystemColors.ButtonFace;
		((ButtonBase)button10).FlatStyle = (FlatStyle)0;
		((Control)button10).Font = new Font("Arial", 10f, (FontStyle)1);
		((Control)button10).ForeColor = Color.Goldenrod;
		((Control)button10).Location = new Point(0, 365);
		((Control)button10).Name = "button10";
		((Control)button10).Size = new Size(634, 48);
		((Control)button10).TabIndex = 10;
		((Control)button10).Text = "RESTART GAME";
		((ButtonBase)button10).UseVisualStyleBackColor = false;
		((Control)button10).Click += button10_Click;
		((Control)button11).BackColor = Color.GhostWhite;
		((Control)button11).BackgroundImageLayout = (ImageLayout)4;
		((Control)button11).Cursor = Cursors.Default;
		((ButtonBase)button11).FlatAppearance.BorderColor = Color.GhostWhite;
		((ButtonBase)button11).FlatAppearance.BorderSize = 0;
		((ButtonBase)button11).FlatAppearance.MouseDownBackColor = Color.GhostWhite;
		((ButtonBase)button11).FlatAppearance.MouseOverBackColor = Color.GhostWhite;
		((ButtonBase)button11).FlatStyle = (FlatStyle)0;
		((Control)button11).Font = new Font("Arial", 18f, (FontStyle)1);
		((Control)button11).ForeColor = SystemColors.ControlText;
		((Control)button11).Location = new Point(118, 47);
		((Control)button11).Name = "button11";
		((Control)button11).Size = new Size(195, 36);
		((Control)button11).TabIndex = 10;
		((Control)button11).Text = "\ud83d\uddd9                    -";
		((ButtonBase)button11).TextAlign = (ContentAlignment)16;
		((ButtonBase)button11).UseVisualStyleBackColor = false;
		((Control)button11).Click += button11_Click;
		((Control)panel2).BackColor = Color.Gold;
		((Control)panel2).Location = new Point(118, 50);
		((Control)panel2).Name = "panel2";
		((Control)panel2).Size = new Size(195, 36);
		((Control)panel2).TabIndex = 11;
		((Control)panel2).Paint += new PaintEventHandler(panel2_Paint);
		((Control)button12).BackColor = Color.GhostWhite;
		((Control)button12).BackgroundImageLayout = (ImageLayout)4;
		((Control)button12).Cursor = Cursors.Default;
		((ButtonBase)button12).FlatAppearance.BorderColor = Color.GhostWhite;
		((ButtonBase)button12).FlatAppearance.BorderSize = 0;
		((ButtonBase)button12).FlatAppearance.MouseDownBackColor = Color.GhostWhite;
		((ButtonBase)button12).FlatAppearance.MouseOverBackColor = Color.GhostWhite;
		((ButtonBase)button12).FlatStyle = (FlatStyle)0;
		((Control)button12).Font = new Font("Arial", 18f, (FontStyle)1);
		((Control)button12).ForeColor = SystemColors.ControlText;
		((Control)button12).Location = new Point(321, 47);
		((Control)button12).Name = "button12";
		((Control)button12).Size = new Size(195, 36);
		((Control)button12).TabIndex = 12;
		((Control)button12).Text = "◯                    -";
		((ButtonBase)button12).TextAlign = (ContentAlignment)16;
		((ButtonBase)button12).UseVisualStyleBackColor = false;
		((Control)button12).Click += button12_Click;
		((Control)panel3).BackColor = Color.Gold;
		((Control)panel3).Location = new Point(321, 76);
		((Control)panel3).Name = "panel3";
		((Control)panel3).Size = new Size(195, 10);
		((Control)panel3).TabIndex = 13;
		((Control)panel3).Visible = false;
		((Control)panel3).Paint += new PaintEventHandler(panel3_Paint);
		((ContainerControl)this).AutoScaleDimensions = new SizeF(6f, 12f);
		((ContainerControl)this).AutoScaleMode = (AutoScaleMode)1;
		((Control)this).BackColor = SystemColors.Control;
		((Form)this).ClientSize = new Size(635, 414);
		((Control)this).Controls.Add((Control)(object)button12);
		((Control)this).Controls.Add((Control)(object)button11);
		((Control)this).Controls.Add((Control)(object)label1);
		((Control)this).Controls.Add((Control)(object)toolStrip1);
		((Control)this).Controls.Add((Control)(object)panel1);
		((Control)this).Controls.Add((Control)(object)button10);
		((Control)this).Controls.Add((Control)(object)panel2);
		((Control)this).Controls.Add((Control)(object)panel3);
		((Form)this).Icon = (Icon)componentResourceManager.GetObject("$this.Icon");
		((Form)this).MaximizeBox = false;
		((Control)this).MinimumSize = new Size(651, 453);
		((Control)this).Name = "Form1";
		((Control)this).Text = "Tic Tac Toe";
		((Form)this).Load += Form1_Load;
		((Control)panel1).ResumeLayout(false);
		((ISupportInitialize)pictureBox2).EndInit();
		((ISupportInitialize)pictureBox1).EndInit();
		((Control)toolStrip1).ResumeLayout(false);
		((Control)toolStrip1).PerformLayout();
		((Control)this).ResumeLayout(false);
		((Control)this).PerformLayout();
	}
}
