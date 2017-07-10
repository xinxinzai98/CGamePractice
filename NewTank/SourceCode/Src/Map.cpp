// Map.cpp: implementation of the CMap class.
//
//////////////////////////////////////////////////////////////////////

#include "Map.h"

//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

CMap::CMap(const char *szname):CAnimateSprite(szname)
{
    m_iTanksTrans = 0;
	m_iBulletsTrans = 0;
	m_iChartlet = 0;
	m_iBroken = 0;
	m_fMinBox = 7.5;
}

CMap::~CMap()
{

}

void CMap::Init()
{
	float X = -37.5+GetNewPosX()*m_fMinBox+m_fMinBox/2;
	float Y =  37.5-GetNewPosY()*m_fMinBox-m_fMinBox/2;
	SetSpritePosition(X,Y);
	ChangeProperty();
	SetSpriteCollisionActive(0,1);//设置为可以接受和发生碰撞
}
void CMap::ChangeProperty()
{
	switch(GetProperty())
		{
			case 1:
				SetTanksTrans(1);
				SetBulletsTrans(1); //地皮
				SetBroken(0);
				break;
			case 2:
				SetTanksTrans(0);
				SetBulletsTrans(1); //山谷 水
				SetBroken(0);
				break;
			case 3:
				SetTanksTrans(0);
				SetBulletsTrans(0); //可破坏物
				SetBroken(1);
				break;
		}
}