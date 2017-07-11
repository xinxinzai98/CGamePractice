// TankPlayer.cpp: implementation of the CTankPlayer class.
//
//////////////////////////////////////////////////////////////////////

#include "TankPlayer.h"

//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

CTankPlayer::CTankPlayer(const char* szname):CWeapon(szname)
{
    m_fSkillOneCD = 0.f;
	m_fSkillTwoCD = 0.f;
    m_fSkillHealCD = 20.0;
    m_fMaxSpeed = 0.f;
    m_iTankState = 0;
    m_fHealTime = 0.f;
    m_bSkillHealState = true;
    m_fSkillHealPlayTime = 2.f; 
    m_fCHangeColorTime = 0;
    m_bFireState = true;
    m_fFireTime = 0;
    m_fSpeedTime = 0;
    m_bSpeedState = true;
    m_fSpeedCCTime = 3.0;
    m_fFireCD = 1.0;
    m_fSpeedCD = 15.0;
    m_fSpeedCCTime = 10.0;
}

CTankPlayer::~CTankPlayer()
{
}

/*void CTankPlayer::TankLoop(float fDeltaTime)
{
    if (m_iTankState==2||m_bSkillHealState==false)
        m_fHealTime+=fDeltaTime;
    if (m_fHealTime>=m_fSkillHealPlayTime)
        SetTankState(1);
    if (m_fHealTime>=m_fSkillHealCD)
        {
            m_fHealTime = 0.f;
            SetSkillHealState(true);
        }
    if(GetSpriteColorGreen()!=255)
    {
        m_fCHangeColorTime+=fDeltaTime;
        if (m_fCHangeColorTime>0.5)
        {
            m_fCHangeColorTime = 0.f;
            SetSpriteColorGreen(255);
            SetSpriteColorBlue(255);
        }
    }
    if (GetFireState()==false)
    {
        m_fFireTime+=fDeltaTime;
        if (m_fFireTime>GetFireCD())
            {
                SetFireState(true);
                m_fFireTime = 0.f;
            }
    }
}*/
void CTankPlayer::TankBack()
{
    float x =  GetSpritePositionX();
    float y =  GetSpritePositionY();
    switch(GetDir())
        {
            case 2:
                y = y + GetTankBackLine();
                break;
            case 3:
                x = x - GetTankBackLine();
                break;
            case 4:
                y = y - GetTankBackLine();
                break;
            case 1:
                x = x + GetTankBackLine();
                break;
        }
    SpriteMoveTo(x,y,50,true);
}
void CTankPlayer::OnColMap(int tanktrans)
{
    if (tanktrans==0)
        {
            SetSpeedX(0);
            SetSpeedY(0);
            SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
        }
}
void CTankPlayer::OnColTank()
{
    SetSpeedX(0);
    SetSpeedY(0);
    SetSpriteLinearVelocity(GetSpeedX(),GetSpeedY());
}
void CTankPlayer::OnColBullet(int owner,float attack)
{
    if (owner==0)
        {
            SetHp(GetHp()-attack);
            SetSpriteColorGreen(120);
            SetSpriteColorBlue(120);
        }
}