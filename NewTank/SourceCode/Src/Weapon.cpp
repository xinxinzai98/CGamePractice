// Weapon.cpp: implementation of the CWeapon class.
//
//////////////////////////////////////////////////////////////////////

#include "Weapon.h"

//////////////////////////////////////////////////////////////////////
// Construction/Destruction
//////////////////////////////////////////////////////////////////////

CWeapon::CWeapon(const char *szname):CAnimateSprite(szname)
{
    m_iDir = 1;
	m_iHp = 2;
	m_fSpeedX = 0.f;
	m_fSpeedY = 0.f;
	m_fAttack = 0.f;
}

CWeapon::~CWeapon()
{

}